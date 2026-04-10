import { ReviewMetadata, Finding } from "./types";
import { CHECKLIST_ITEMS } from "./constants";

// Calls your Netlify Function (server-side) which talks to Azure
async function callAzureOpenAI(messages: any[]) {
  const response = await fetch("/.netlify/functions/azure-openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const text = await response.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from function: ${text}`);
  }
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Invalid response format from Azure function");
  return content as string;
}

// 1) Remedial actions - IMPROVED VERSION
export const generateRemedialActions = async (
  metadata: ReviewMetadata,
  findings: Finding[]
): Promise<string[]> => {
  const negative = findings.filter((f) => f.status === "NO");
  if (negative.length === 0) return ["Review completed successfully. No remedial actions required."];

  // Get full context for each failed item
  const findingsWithContext = negative.map((f) => {
    const item = CHECKLIST_ITEMS.find((i) => i.id === f.itemId);
    return {
      title: item?.text || f.itemId,
      subtitle: (item as any)?.subtitle || "",
      comment: f.comment || "Issue identified"
    };
  });

  const prompt = `You are a compliance officer at Fairbairn Consult preparing remedial actions for a financial services audit.

CLIENT DETAILS:
Representative: ${metadata.representativeName}
Client: ${metadata.clientName}
Policy Number: ${metadata.policyNo}
Insurer: ${metadata.insurerName}

COMPLIANCE FAILURES IDENTIFIED:
${findingsWithContext.map((f, i) => 
  `${i + 1}. ${f.title}
   Context: ${f.subtitle}
   Auditor Notes: ${f.comment}`
).join('\n\n')}

INSTRUCTIONS:
Create ${negative.length} specific, actionable remedial actions - one for each compliance failure above.

Each action must:
- Be professionally worded for a compliance audit report
- Clearly state WHAT needs to be done
- Reference the SPECIFIC document or process (e.g., "Contact Stage Disclosures", "Broker Appointment", "Policy Schedule")
- Reference the client name where appropriate
- Include specific filing instructions (e.g., "File under Item ID: contact_disclosure")
- Be detailed enough that the representative knows exactly what to do
- NOT use generic phrases like "address the gap" or "ensure compliance"

IMPORTANT: 
- Do NOT reference item IDs in the action text itself
- Do NOT use technical jargon like "itemId" or "finding"
- Focus on the actual compliance requirement, not the checklist structure

Return ONLY a valid JSON array of strings (no markdown, no code blocks, no preamble):
["Action 1 text here", "Action 2 text here", ...]`;

  try {
    const content = await callAzureOpenAI([
      { 
        role: "system", 
        content: "You are a financial compliance expert. Return ONLY a valid JSON array of strings with no markdown formatting, no code blocks, and no explanatory text." 
      },
      { role: "user", content: prompt },
    ]);
    
    // Clean up the response
    const clean = content
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    
    const arr = JSON.parse(clean);
    
    if (!Array.isArray(arr)) {
      throw new Error("Response is not an array");
    }
    
    return arr.map(String);
  } catch (e) {
    console.error("AI remedial action generation failed:", e);
    
    // Enhanced fallback with more context
    return findingsWithContext.map((f) => {
      // Create a more detailed fallback action
      let action = `Address the compliance gap: ${f.title}.`;
      
      if (f.title.toLowerCase().includes("contact")) {
        action = `Ensure that the adviser, ${metadata.representativeName}, provides proof of licensing and accreditation, and submits a signed disclosure letter to confirm compliance with contact stage disclosures. Update the client file with these documents.`;
      } else if (f.title.toLowerCase().includes("authority") || f.title.toLowerCase().includes("appointment")) {
        action = `Obtain a signed client authority or broker appointment note from ${metadata.clientName} to confirm authorization for representation. File the document appropriately.`;
      } else if (f.title.toLowerCase().includes("fica") || f.title.toLowerCase().includes("identification")) {
        action = `Collect certified copies of ${metadata.clientName}'s identification documents, registration details, and a recent utility bill to meet FICA requirements. Ensure these verification documents are properly filed.`;
      } else if (f.title.toLowerCase().includes("schedule") || f.title.toLowerCase().includes("policy")) {
        action = `Retrieve and store the latest Policy Schedule from ${metadata.insurerName || "the product provider"}.`;
      } else if (f.title.toLowerCase().includes("fact find")) {
        action = `Complete and document a full Fact Find including ${metadata.clientName}'s financial needs, objectives, and affordability.`;
      } else if (f.title.toLowerCase().includes("risk")) {
        action = `Administer a formal risk tolerance assessment and file the completed risk profile for ${metadata.clientName}.`;
      } else if (f.title.toLowerCase().includes("needs analysis") || f.title.toLowerCase().includes("fna")) {
        action = `Draft and file a comprehensive Financial Needs Analysis (FNA) report for ${metadata.clientName}.`;
      } else if (f.title.toLowerCase().includes("quote") || f.title.toLowerCase().includes("comparison")) {
        action = `Obtain at least three comparative quotes and file the detailed comparison schedule.`;
      } else if (f.title.toLowerCase().includes("advice") || f.title.toLowerCase().includes("warning")) {
        action = `Provide ${metadata.clientName} with a written Limited Advice warning and retain proof of acknowledgement.`;
      } else if (f.title.toLowerCase().includes("record of advice") || f.title.toLowerCase().includes("roa")) {
        action = `Generate a formal Record of Advice (ROA) signed by both ${metadata.clientName} and the advisor.`;
      } else if (f.title.toLowerCase().includes("replacement")) {
        action = `Prepare and file the Replacement Policy Disclosure document if a policy replacement occurred.`;
      } else if (f.title.toLowerCase().includes("suitability") || f.title.toLowerCase().includes("rationale")) {
        action = `Document the specific rationale justifying how the selected product aligns with ${metadata.clientName}'s identified needs.`;
      } else if (f.title.toLowerCase().includes("deviation") || f.title.toLowerCase().includes("implication")) {
        action = `Record the explanation of implications provided to ${metadata.clientName} regarding any deviations from advice.`;
      } else if (f.title.toLowerCase().includes("document") || f.title.toLowerCase().includes("index") || f.title.toLowerCase().includes("stor")) {
        action = `Ensure all client documentation is properly indexed and stored in a retrievable electronic format.`;
      } else if (f.title.toLowerCase().includes("supervision") || f.title.toLowerCase().includes("sign-off")) {
        action = `Submit the file for internal compliance review and record the sign-off in the Supervision Register.`;
      }
      
      // Add the auditor's comment if it provides useful context
      if (f.comment && f.comment !== "Issue identified" && !action.includes(f.comment)) {
        action += ` Note: ${f.comment}`;
      }
      
      return action;
    });
  }
};

// 2a) Scan multiple PDF pages (rendered as images) -> extract metadata + findings
// Supports handwritten notes via Azure OpenAI Vision
export const extractAuditDataFromPages = async (
  pages: Array<{ base64: string; mimeType: string }>
): Promise<{ metadata?: Partial<ReviewMetadata>; findings?: Partial<Finding>[] }> => {
  const prompt = `Analyze all attached document pages — including any handwritten notes, stamps, or annotations.
Return ONLY valid JSON:
{
  "metadata": {
    "representativeName": "",
    "clientName": "",
    "policyNo": "",
    "insurerName": ""
  },
  "findings": [
    {"itemId":"contact_disclosure","status":"YES","comment":""}
  ]
}`;
  try {
    const imageContent = pages.map((p) => ({
      type: "image_url",
      image_url: { url: `data:${p.mimeType};base64,${p.base64}` },
    }));
    const content = await callAzureOpenAI([
      { role: "system", content: "Return ONLY valid JSON. Read all text including handwritten annotations and stamps." },
      {
        role: "user",
        content: [{ type: "text", text: prompt }, ...imageContent],
      },
    ]);
    const clean = content.replace(/```json/gi, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error(e);
    return {};
  }
};

// 2b) Scan single image -> extract metadata + findings
export const extractAuditDataFromFile = async (
  base64Image: string,
  mimeType: string
): Promise<{ metadata?: Partial<ReviewMetadata>; findings?: Partial<Finding>[] }> => {
  const prompt = `Analyze the attached compliance document image.
Return ONLY valid JSON:
{
  "metadata": {
    "representativeName": "",
    "clientName": "",
    "policyNo": "",
    "insurerName": ""
  },
  "findings": [
    {"itemId":"contact_disclosure","status":"YES","comment":""}
  ]
}`;
  try {
    const content = await callAzureOpenAI([
      { role: "system", content: "Return ONLY valid JSON." },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64Image}` } },
        ],
      },
    ]);
    const clean = content.replace(/```json/gi, "").replace(/```/g, "").trim();
    return JSON.parse(clean);
  } catch (e) {
    console.error(e);
    return {};
  }
};

// 3) Summary - IMPROVED VERSION
export const generateReportSummary = async (
  metadata: ReviewMetadata,
  findings: Finding[]
): Promise<string> => {
  const yesCount = findings.filter(f => f.status === "YES").length;
  const noCount = findings.filter(f => f.status === "NO").length;
  const totalCount = findings.length;
  const score = Math.round((yesCount / totalCount) * 100);

  // Get failed items with context
  const failedItems = findings
    .filter(f => f.status === "NO")
    .map(f => {
      const item = CHECKLIST_ITEMS.find(i => i.id === f.itemId);
      return {
        title: item?.text || f.itemId,
        subtitle: (item as any)?.subtitle || "",
        comment: f.comment
      };
    });

  const prompt = `You are a senior compliance officer at Fairbairn Consult writing an executive summary for an audit report.

AUDIT DETAILS:
Representative: ${metadata.representativeName}
Client: ${metadata.clientName}
Policy: ${metadata.policyNo}${metadata.insurerName ? ` (${metadata.insurerName})` : ""}
Audit Date: ${metadata.reviewDate}
Compliance Score: ${score}%
Items Passed: ${yesCount}/${totalCount}
Items Failed: ${noCount}/${totalCount}

${noCount > 0 ? `COMPLIANCE GAPS IDENTIFIED:
${failedItems.map((f, i) => `${i + 1}. ${f.title}${f.subtitle ? ` - ${f.subtitle}` : ""}${f.comment ? `\n   Auditor Notes: ${f.comment}` : ""}`).join('\n\n')}` : 'All compliance items were satisfied.'}

Write a professional executive summary following this EXACT structure:

**Compliance Summary**

**Outcome:**
[1-2 sentences on overall audit result, score, and whether gaps were found]

---

**Key Issues:**
${noCount > 0 ? `[List the ${noCount} main compliance gaps as bullet points, being specific about WHAT was missing]` : '[State that all items were compliant]'}

---

**Risk Themes:**
[Identify 2-3 risk categories these gaps create - regulatory, operational, reputational, client trust, etc.]

---

**Next Steps:**
[Outline the immediate actions required and any follow-up needed]

IMPORTANT:
- Use the exact structure shown above with "---" dividers
- Be concise but professional
- Reference the representative and client by name
- For perfect scores (100%), emphasize strong compliance culture
- For failed audits, be direct but constructive
- Use markdown formatting (**bold** for headers)
- Keep total length under 400 words

Return the summary text directly (no JSON, no code blocks):`;

  try {
    const content = await callAzureOpenAI([
      {
        role: "system",
        content: "You are a compliance expert writing executive summaries. Write clear, professional summaries using the exact structure provided."
      },
      { role: "user", content: prompt },
    ]);
    return content.trim();
  } catch (e) {
    console.error("Summary generation failed:", e);
    
    // Fallback summary
    if (score === 100) {
      return `**Compliance Summary**\n\n**Outcome:**\nThe compliance review for client ${metadata.clientName}, represented by ${metadata.representativeName}, was successfully completed with a perfect score of 100%. All compliance items were met, and no remedial actions are required.\n\n---\n\n**Key Issues:**\n- All compliance items were marked as "YES," indicating full adherence to regulatory and procedural requirements.\n- No deviations or gaps were identified during the review process.\n\n---\n\n**Risk Themes:**\n- No risks were identified as all compliance criteria were satisfied.\n- The review demonstrates strong adherence to compliance standards, minimizing exposure to regulatory or operational risks.\n\n---\n\n**Next Steps:**\n- Confirm closure of the review process by ensuring the status of the remedial action ("Review completed successfully. No remedial actions required") is updated to "COMPLETED" by the due date (${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}).\n- Continue maintaining high compliance standards in future reviews.`;
    }
    
    return `**Compliance Summary**\n\n**Outcome:**\nRepresentative ${metadata.representativeName} demonstrated ${score >= 70 ? 'good' : 'poor'} overall performance, achieving a compliance score of ${score}%. ${noCount === 1 ? 'A single identified gap requires' : `${noCount} identified gaps require`} targeted remediation to ensure full alignment with established operational standards.\n\n---\n\n**Key Issues:**\n${failedItems.map((f, i) => `- **${f.title}:** ${f.subtitle || 'Compliance gap identified'}`).join('\n')}\n\n---\n\n**Risk Themes:**\n- **Regulatory Non-Compliance:** ${noCount > 1 ? 'Multiple gaps pose' : 'The gap poses'} a risk of non-compliance with financial regulations.\n- **Operational Oversight:** ${noCount > 1 ? 'These gaps suggest' : 'This gap suggests'} potential weaknesses in internal processes and oversight mechanisms.\n${noCount > 2 ? '- **Client Trust and Transparency:** Documentation gaps may impact client confidence and transparency in communication.' : ''}\n\n---\n\n**Next Steps:**\n- Address all identified compliance gaps immediately\n- Complete required documentation and file appropriately\n- Submit for internal compliance review by ${new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}`;
  }
};

// 4) Connection test
export const testAzureConnection = async (): Promise<boolean> => {
  try {
    const content = await callAzureOpenAI([{ role: "user", content: "Reply with OK" }]);
    return content.toUpperCase().includes("OK");
  } catch {
    return false;
  }
};

// 5a) Extract CAR metadata from images (Vision)
export const extractCARDetailsFromImages = async (
  images: Array<{ base64: string; mimeType: string }>
): Promise<{
  representativeName?: string;
  clientName?: string;
  caseNumber?: string;
  productType?: string;
  policyNumber?: string;
  insurerName?: string;
  adviceDate?: string;
}> => {
  const imageContent = images.slice(0, 5).map((img) => ({
    type: "image_url",
    image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
  }));

  const content = await callAzureOpenAI([
    {
      role: "system",
      content:
        "You are a document parser. Extract key details from financial advice document images including handwritten notes. Return ONLY valid JSON. No markdown.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Extract the following details from these Client Advice Record document images. If a field is not found return an empty string.

Return ONLY this JSON:
{
  "representativeName": "",
  "clientName": "",
  "caseNumber": "",
  "productType": "",
  "policyNumber": "",
  "insurerName": "",
  "adviceDate": ""
}`,
        },
        ...imageContent,
      ],
    },
  ]);

  const clean = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(clean);
};

// 5b) CAR Evaluator
export const evaluateCAR = async (
  carText: string,
  representativeName: string,
  clientName: string,
  meta?: { caseNumber?: string; productType?: string; policyNumber?: string; insurerName?: string; adviceDate?: string },
  images?: Array<{ base64: string; mimeType: string }>
): Promise<any> => {

  const docSection = carText.trim()
    ? `CLIENT ADVICE RECORD TEXT:\n"""\n${carText}\n"""`
    : `CLIENT ADVICE RECORD: See attached document images below.`;

  const prompt = `You are a senior FAIS compliance specialist at Fairbairn Consult evaluating a Client Advice Record (CAR) / Record of Advice (ROA).

DOCUMENT DETAILS:
Representative: ${representativeName}
Client: ${clientName}

${docSection}

Your tasks:
1. EXTRACT key details from the document (case number, product type, policy number, insurer, date of advice)
2. EVALUATE the CAR against South African FAIS Act, FSCA standards, and TCF principles

Return ONLY valid JSON:
{
  "extractedMeta": {
    "caseNumber": "extracted case/reference number or empty string",
    "productType": "e.g. Life Cover, Retirement Annuity, Dread Disease",
    "policyNumber": "extracted policy number or empty string",
    "insurerName": "extracted insurer name or empty string",
    "adviceDate": "extracted date of advice or empty string"
  },
  "overallScore": 72,
  "overallVerdict": "The CAR demonstrates basic advice documentation but lacks critical suitability justification and risk disclosure detail required under FAIS.",
  "strengths": [
    "Client contact details are complete",
    "Product details are clearly stated"
  ],
  "issues": [
    {
      "category": "Suitability of Advice",
      "severity": "HIGH",
      "whatWasWritten": "Client needs life cover.",
      "whatIsWrong": "Does not demonstrate how the product was matched to the client needs, income, dependants or existing cover. FAIS requires the adviser to justify WHY this specific product and benefit amount is suitable.",
      "whatShouldBeWritten": "Based on the client monthly income of R25,000, three financial dependants, existing funeral cover of R50,000, and no current life cover, the client has an identified shortfall of R2.1 million. The recommended Old Mutual Protect Plan at R1.5 million addresses the priority life cover need within the client stated affordability of R800/month.",
      "industryExample": "Client X earns R30,000/month net with two dependants. Client has no existing life cover. Based on the needs analysis a minimum cover of R1.8m is required. The recommended Momentum Myriad Policy provides R2m cover at R920/month which falls within the client stated budget of R1,000/month and directly addresses the identified shortfall."
    }
  ]
}

Rules:
- severity HIGH = regulatory breach risk, MEDIUM = best practice gap, LOW = minor improvement
- whatWasWritten must be ACTUAL text from the document or state "Not addressed in document"
- industryExample must be realistic and detailed showing best practice
- overallScore: 0-100 based on compliance quality
- Only include real issues actually found in the document
- Return ONLY the JSON with no markdown`;

  const imageContent = (images || []).slice(0, 5).map((img) => ({
    type: "image_url",
    image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
  }));

  const userContent: any =
    imageContent.length > 0
      ? [{ type: "text", text: prompt }, ...imageContent]
      : prompt;

  const content = await callAzureOpenAI([
    {
      role: "system",
      content:
        "You are a FAIS compliance specialist. Extract document details and evaluate Client Advice Records. Return ONLY valid JSON. Never return markdown or text outside the JSON.",
    },
    { role: "user", content: userContent },
  ]);

  const clean = content.replace(/```json/gi, "").replace(/```/g, "").trim();
  return JSON.parse(clean);
}
