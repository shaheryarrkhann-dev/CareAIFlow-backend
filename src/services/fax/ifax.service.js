const axios = require("axios");
const {
  FAX_MAX_PDF_BYTES,
  preparePdfBufferForFax,
} = require("../../utils/pdfFax.util");

const IFAX_SEND_URL = "https://api.ifaxapp.com/v1/customer/fax-send";

/**
 * Normalize user-entered fax to E.164-style (+ and digits only).
 * 10-digit US numbers get +1 prefix.
 */
function normalizeFaxNumber(input) {
  const raw = String(input || "").trim();
  if (!raw) {
    throw new Error("Fax number is required");
  }
  const compact = raw.replace(/[\s().-]/g, "");
  if (compact.startsWith("+")) {
    const digits = compact.slice(1).replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 15) {
      throw new Error(
        "Invalid fax number. Use international format with country code (e.g. +12065551234)."
      );
    }
    return `+${digits}`;
  }
  const digits = compact.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }
  throw new Error(
    "Invalid fax number. Include country code (e.g. +12065551234 for US)."
  );
}

function stripPdfBase64(pdfBase64) {
  let attachmentB64 = String(pdfBase64).trim();
  const dataUrlIdx = attachmentB64.indexOf("base64,");
  if (attachmentB64.startsWith("data:") && dataUrlIdx !== -1) {
    attachmentB64 = attachmentB64.slice(dataUrlIdx + "base64,".length);
  }
  return attachmentB64.replace(/\s/g, "");
}

function isIfaxConfigured() {
  return Boolean(process.env.IFAX_API_KEY && String(process.env.IFAX_API_KEY).trim());
}

/**
 * Send a PDF via iFax (https://www.ifaxapp.com/docs/api-quick-guide/).
 *
 * @param {object} opts
 * @param {string} opts.faxNumber - Recipient fax (normalized to E.164)
 * @param {string} opts.pdfBase64 - Raw base64 PDF
 * @param {string} opts.fileName - Attachment file name (.pdf)
 * @param {string} [opts.subject] - Cover page subject
 * @param {string} [opts.message] - Cover page message
 * @param {string} [opts.fromName] - Cover page sender name
 * @param {string} [opts.toName] - Cover page recipient name
 */
async function sendFaxReport({
  faxNumber,
  pdfBase64,
  fileName,
  subject,
  message,
  fromName,
  toName,
}) {
  if (!isIfaxConfigured()) {
    throw new Error(
      "iFax is not configured. Set IFAX_API_KEY (Settings → Developer API in iFax dashboard)."
    );
  }

  const token = String(process.env.IFAX_API_KEY).trim();
  const fn = normalizeFaxNumber(faxNumber);

  const safeName = String(fileName || "report.pdf")
    .replace(/[/\\?%*:|"<>]/g, "_")
    .slice(0, 200);
  if (!safeName.toLowerCase().endsWith(".pdf")) {
    throw new Error("Attachment filename must end with .pdf");
  }

  const fileData = stripPdfBase64(pdfBase64);
  let pdfBuf;
  try {
    pdfBuf = Buffer.from(fileData, "base64");
  } catch {
    throw new Error("Invalid PDF encoding");
  }
  if (!pdfBuf.length) {
    throw new Error("PDF is empty");
  }

  pdfBuf = await preparePdfBufferForFax(pdfBuf);

  if (pdfBuf.length > FAX_MAX_PDF_BYTES) {
    throw new Error(
      `PDF is too large for fax (max about ${Math.round(FAX_MAX_PDF_BYTES / (1024 * 1024))}MB).`
    );
  }

  const payload = {
    faxNumber: fn,
    faxQuality: process.env.IFAX_FAX_QUALITY || "Standard",
    faxData: [{ fileName: safeName, fileData: pdfBuf.toString("base64") }],
  };

  if (subject && String(subject).trim()) {
    payload.subject = String(subject).trim().slice(0, 200);
  }
  if (message && String(message).trim()) {
    payload.message = String(message).trim().slice(0, 2000);
  }
  if (fromName && String(fromName).trim()) {
    payload.from_name = String(fromName).trim().slice(0, 100);
  }
  if (toName && String(toName).trim()) {
    payload.to_name = String(toName).trim().slice(0, 100);
  }

  const callerId = process.env.IFAX_CALLER_ID;
  if (callerId && String(callerId).trim()) {
    try {
      payload.callerId = normalizeFaxNumber(String(callerId).trim());
    } catch {
      /* skip invalid env caller ID */
    }
  }

  try {
    const res = await axios.post(IFAX_SEND_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        accessToken: token,
      },
      timeout: 120000,
      maxBodyLength: 25 * 1024 * 1024,
      maxContentLength: 25 * 1024 * 1024,
    });

    const body = res.data;
    if (body && body.status === 1) {
      return {
        success: true,
        jobId: body.data?.jobId ?? body.data?.job_id,
        message: body.message || "Fax queued for sending.",
      };
    }

    const errMsg =
      body?.message ||
      body?.error ||
      (typeof body === "string" ? body : "iFax rejected the request");
    const err = new Error(`iFax: ${errMsg}`);
    err.status = 502;
    throw err;
  } catch (e) {
    if (axios.isAxiosError(e)) {
      const data = e.response?.data;
      const code = e.code || e.cause?.code;
      const rawMsg = e.message || "";
      let msg =
        (data && (data.message || data.error)) ||
        rawMsg ||
        "iFax request failed";

      // DNS / connectivity (no HTTP response from iFax)
      if (
        code === "EAI_AGAIN" ||
        code === "ENOTFOUND" ||
        code === "ECONNREFUSED" ||
        rawMsg.includes("getaddrinfo")
      ) {
        msg =
          "Cannot reach iFax (DNS or network). Check your internet connection, VPN/firewall, and DNS. If this persists, try another network or `nslookup api.ifaxapp.com` from the machine running the API.";
      } else if (code === "ETIMEDOUT" || code === "ECONNABORTED") {
        msg =
          "Connection to iFax timed out. Retry or check firewall/proxy settings on the server.";
      }

      const err = new Error(
        typeof msg === "string" ? `iFax: ${msg}` : `iFax: ${JSON.stringify(data)}`
      );
      err.status =
        typeof e.response?.status === "number" && e.response.status < 600
          ? e.response.status
          : 502;
      throw err;
    }
    throw e;
  }
}

module.exports = {
  sendFaxReport,
  isIfaxConfigured,
  normalizeFaxNumber,
};
