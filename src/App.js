import React, { useState } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [ip, setIp] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Your webhook URL from n8n
  const WEBHOOK_URL = "http://localhost:5678/webhook-test/a1a5bc5c-958c-4394-843b-5b9de146d34c";

  // Function to extract risk score from text
  const extractRiskScore = (text) => {
    // Look for patterns like "`risk_score` of 0.005" or "risk_score of 0.005"
    const riskMatch = text.match(/[`']?risk[_\s]*score[`']?\s*(?:of|:)?\s*([\d.]+)/i);
    if (riskMatch) {
      return parseFloat(riskMatch[1]);
    }
    return 0;
  };

  // Function to extract confidence from text
  const extractConfidence = (text) => {
    // Convert to lowercase for easier matching
    const lowerText = text.toLowerCase();
    
    // Find the position of "confidence"
    const confIndex = lowerText.indexOf('confidence');
    
    if (confIndex === -1) {
      return "unknown";
    }
    
    // Get 150 characters around the word "confidence"
    const start = Math.max(0, confIndex - 50);
    const end = Math.min(lowerText.length, confIndex + 100);
    const snippet = lowerText.substring(start, end);
    
    // Simple check - does this snippet contain high, medium, or low?
    if (snippet.includes('high')) {
      return 'high';
    }
    if (snippet.includes('medium')) {
      return 'medium';
    }
    if (snippet.includes('low')) {
      return 'low';
    }
    
    return "unknown";
  };

  // Function to extract the main analysis text
  const extractAnalysis = (text) => {
    // Try to get the Summary for Non-Technical Stakeholders section first (most concise)
    const summaryMatch = text.match(/###\s*Summary for Non-Technical Stakeholders[:\s]*\n*"?(.*?)(?:"|$)/is);
    if (summaryMatch) {
      return summaryMatch[1].trim().replace(/^["']|["']$/g, '');
    }
    
    // Try to get the Overall Behavioral Assessment section
    const assessmentMatch = text.match(/###\s*Overall Behavioral Assessment[:\s]*\n*(.*?)(?:\n###|$)/is);
    if (assessmentMatch) {
      return assessmentMatch[1].trim();
    }
    
    // Fallback: Get first meaningful paragraph after risk interpretation
    const paragraphMatch = text.match(/The\s+(?:system behavior|assessment)[^.]+\.[^.]+\./i);
    if (paragraphMatch) {
      return paragraphMatch[0].trim();
    }
    
    // Last resort: return first 250 characters
    return text.substring(0, 250).trim() + '...';
  };

  const analyze = async () => {
    if (!ip.trim()) {
      setError("Please enter an IPv4 address to analyze.");
      return;
    }
  
    setLoading(true);
    setError(null);
    setResult(null);
  
    try {
      // Manual timeout controller (60 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, 120000); // 80 seconds
  
      const res = await axios.post(
        WEBHOOK_URL,
        {
          ip: ip.trim(),
          indicator: ip.trim(),
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal, // Use AbortController
          timeout: 0, // Disable axios internal timeout
        }
      );
  
      clearTimeout(timeoutId);
  
      console.log("📥 Raw n8n response:", res.data);
  
      if (!res.data) {
        throw new Error("Empty response from n8n workflow");
      }
  
      let textContent = "";
  
      // Handle different response formats
      if (Array.isArray(res.data)) {
        textContent = res.data[0]?.text || JSON.stringify(res.data);
      } else if (typeof res.data === "string") {
        textContent = res.data;
      } else if (res.data.text) {
        textContent = res.data.text;
      } else if (res.data.json) {
        textContent = res.data.json.text || JSON.stringify(res.data.json);
      } else {
        textContent = JSON.stringify(res.data);
      }
  
      console.log("📝 Extracted text:", textContent);
  
      // Extract the data from text
      const riskScore = extractRiskScore(textContent);
      const confidence = extractConfidence(textContent);
      const analysis = extractAnalysis(textContent);
  
      console.log("🔍 Extraction Details:");
      console.log(
        "  - Risk Score Match:",
        textContent.match(/[`']?risk[_\s]*score[`']?\s*(?:of|:)?\s*([\d.]+)/i)
      );
  
      const confIndex = textContent.toLowerCase().indexOf("confidence");
      if (confIndex !== -1) {
        const snippet = textContent.substring(
          Math.max(0, confIndex - 20),
          Math.min(textContent.length, confIndex + 100)
        );
        console.log("  - Confidence snippet:", snippet);
      }
  
      console.log("🎯 Parsed values:", {
        riskScore,
        confidence,
        analysis: analysis.substring(0, 100) + "...",
      });
  
      setResult({
        risk_score: riskScore,
        confidence: confidence,
        analysis: analysis,
        raw_text: textContent,
      });
  
    } catch (err) {
      console.error("❌ Error details:", err);
  
      if (err.code === "ECONNREFUSED") {
        setError("❌ Cannot connect to n8n. Make sure n8n is running on localhost:5678");
      } else if (err.name === "CanceledError") {
        setError("⏱️ Request exceeded 60 seconds. The workflow may be too slow in test mode.");
      } else if (err.response) {
        setError(`⚠️ n8n returned error: ${err.response.status} - ${err.response.statusText}`);
      } else {
        setError(`⚠️ Connection error: ${err.message}`);
      }
    }
  
    setLoading(false);
  };

  const riskLabel = (score) => {
    if (score > 0.75) return "🚨 High Risk";
    if (score > 0.4) return "⚠️ Suspicious";
    return "✅ Low Risk";
  };

  const riskColor = (score) => {
    if (score > 0.75) return "#ef4444";
    if (score > 0.4) return "#f59e0b";
    return "#22c55e";
  };

  return (
    <div className="main">
      <div className="dashboard">
        <h1>🛡️ OTX-Based Threat Risk Dashboard</h1>
        <p className="subtitle">ML-Powered IPv4 Threat Analysis</p>

        <div className="input-row">
          <input
            type="text"
            className="ip-input"
            placeholder="Enter IPv4 address (e.g. 8.8.8.8)"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            disabled={loading}
          />
          <button 
            onClick={analyze} 
            disabled={loading}
            className="analyze-btn"
          >
            {loading ? "⏳ Analyzing..." : "▶️ Run Threat Analysis"}
          </button>
        </div>

        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Running ML Threat Pipeline via n8n...</p>
            <small>Fetching OTX data → Processing with Gemini → Calculating risk score</small>
          </div>
        )}

        {error && (
          <div className="error-card">
            <h3>Connection Error</h3>
            <p>{error}</p>
            <div className="troubleshoot">
              <h4>Troubleshooting Steps:</h4>
              <ul>
                <li>✓ Make sure n8n is running (check http://localhost:5678)</li>
                <li>✓ Click "Listen for test event" in your n8n Webhook node</li>
                <li>✓ Verify the workflow is activated (toggle switch in n8n)</li>
                <li>✓ Check that the webhook URL matches your n8n workflow</li>
              </ul>
            </div>
          </div>
        )}

        {result && (
          <div className="result-card">
            <div
              className="risk-score"
              style={{ backgroundColor: riskColor(result.risk_score) }}
            >
              {(result.risk_score * 100).toFixed(2)}%
            </div>

            <div className="risk-label">
              {riskLabel(result.risk_score)}
            </div>

            <div className="confidence">
              <strong>Model Confidence:</strong> {result.confidence}
            </div>

            <div className="analysis">
              <h3>🔍 Behavioral Assessment</h3>
              <p>{result.analysis}</p>
            </div>

            {/* Debug section */}
            <details className="debug-section">
              <summary>🔧 Debug Info (click to expand)</summary>
              <div className="debug-content">
                <h4>Extracted Values:</h4>
                <pre className="debug-values">
{`Risk Score: ${result.risk_score}
Confidence: ${result.confidence}
Analysis Length: ${result.analysis.length} chars`}
                </pre>
                
                <h4>Raw Text Response:</h4>
                <pre className="debug-raw">{result.raw_text}</pre>
              </div>
            </details>
          </div>
        )}

        <div className="footer">
          <p>Powered by n8n + Google Gemini + AlienVault OTX</p>
        </div>
      </div>
    </div>
  );
}

export default App;