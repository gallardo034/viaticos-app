import { useState, useRef, useCallback, useEffect } from "react";
import * as XLSX from "xlsx";

const EXPENSE_CATEGORIES = [
  "Alojamiento","Alimentación","Transporte","Combustible",
  "Peaje","Estacionamiento","Comunicaciones","Materiales","Otros",
];

const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth();

// ─── Helpers ────────────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = () => rej(new Error("Error leyendo archivo"));
    r.readAsDataURL(file);
  });
}

function formatCurrency(val) {
  if (!val && val !== 0) return "";
  return Number(val).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const inputStyle = {
  width: "100%", padding: "10px 14px", background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(174,214,241,0.2)", borderRadius: 8,
  color: "#e8dcc8", fontSize: 14, outline: "none",
  boxSizing: "border-box", fontFamily: "system-ui",
};

const cellInputStyle = {
  padding: "6px 10px", background: "rgba(0,0,0,0.3)",
  border: "1px solid rgba(174,214,241,0.15)", borderRadius: 6,
  color: "#e8dcc8", fontSize: 13, outline: "none", fontFamily: "system-ui",
};

function btnStyle(bg, accent) {
  return {
    padding: "10px 20px", background: bg,
    border: `1px solid ${accent}40`, borderRadius: 8,
    color: "#e8dcc8", fontSize: 14, cursor: "pointer",
    display: "inline-flex", alignItems: "center", gap: 8,
    transition: "all 0.2s", fontFamily: "system-ui",
  };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function App() {
  const [employee, setEmployee] = useState({ name: "", department: "", position: "" });
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [toast, setToast] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("anthropic_key") || "");
  const [showKeyInput, setShowKeyInput] = useState(false);
  const fileInputRef = useRef();
  const cameraInputRef = useRef();

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));
    if (window.matchMedia("(display-mode: standalone)").matches) setIsInstalled(true);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") { setIsInstalled(true); setInstallPrompt(null); }
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const saveApiKey = (key) => {
    setApiKey(key);
    localStorage.setItem("anthropic_key", key);
    setShowKeyInput(false);
    showToast("✓ API Key guardada");
  };

  // ── AI Extraction ──────────────────────────────────────────────────────────

  const extractWithAI = async (file) => {
    if (!apiKey) {
      setShowKeyInput(true);
      showToast("Primero ingresá tu API Key de Anthropic", "warn");
      return;
    }
    setLoading(true);
    setLoadingMsg("Analizando comprobante con IA…");
    try {
      const isImage = file.type.startsWith("image/");
      const isPdf = file.type === "application/pdf";
      if (!isImage && !isPdf) throw new Error("Formato no soportado");

      const base64 = await fileToBase64(file);
      const contentBlock = isImage
        ? { type: "image", source: { type: "base64", media_type: file.type, data: base64 } }
        : { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } };

      const prompt = `Analiza este comprobante/factura y extrae la información. Responde SOLO con JSON válido, sin markdown ni backticks:
{"proveedor":"nombre del emisor","fecha":"DD/MM/YYYY","monto":1234.56,"categoria":"una de: Alojamiento, Alimentación, Transporte, Combustible, Peaje, Estacionamiento, Comunicaciones, Materiales, Otros","descripcion":"descripción breve","numero_comprobante":"número si existe"}
Si no podés leer algún dato, usá null. El monto debe ser número.`;

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          messages: [{ role: "user", content: [contentBlock, { type: "text", text: prompt }] }],
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const text = data.content?.map(i => i.text || "").join("") || "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());

      setExpenses(prev => [...prev, {
        id: Date.now(),
        proveedor: parsed.proveedor || "",
        fecha: parsed.fecha || "",
        monto: parsed.monto || 0,
        categoria: EXPENSE_CATEGORIES.includes(parsed.categoria) ? parsed.categoria : "Otros",
        descripcion: parsed.descripcion || "",
        numero_comprobante: parsed.numero_comprobante || "",
        fileName: file.name,
      }]);
      showToast("✓ Comprobante procesado correctamente");
    } catch (err) {
      console.error(err);
      setExpenses(prev => [...prev, {
        id: Date.now(), proveedor: "", fecha: "", monto: 0,
        categoria: "Otros", descripcion: "", numero_comprobante: "", fileName: file.name,
      }]);
      showToast("No se pudo extraer automáticamente. Completá los datos manualmente.", "warn");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  };

  const handleFiles = async (files) => {
    for (const file of files) await extractWithAI(file);
  };

  const handleDrop = useCallback((e) => {
    e.preventDefault(); setDragOver(false);
    handleFiles(Array.from(e.dataTransfer.files));
  }, [apiKey]);

  const updateExpense = (id, field, value) =>
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));

  const removeExpense = (id) =>
    setExpenses(prev => prev.filter(e => e.id !== id));

  const totalAmount = expenses.reduce((sum, e) => sum + (parseFloat(e.monto) || 0), 0);

  const byCategory = EXPENSE_CATEGORIES.map(cat => ({
    cat,
    total: expenses.filter(e => e.categoria === cat).reduce((s, e) => s + (parseFloat(e.monto) || 0), 0),
  })).filter(c => c.total > 0);

  // ── Excel Export ───────────────────────────────────────────────────────────

  const exportToExcel = () => {
    if (expenses.length === 0) { showToast("No hay gastos para exportar", "warn"); return; }
    const wb = XLSX.utils.book_new();

    const detailData = [
      [`LIQUIDACIÓN DE VIÁTICOS - ${MONTHS[selectedMonth].toUpperCase()} ${selectedYear}`],
      [],
      ["Empleado:", employee.name, "", "Departamento:", employee.department],
      ["Cargo:", employee.position, "", "Período:", `${MONTHS[selectedMonth]} ${selectedYear}`],
      [],
      ["N°", "Fecha", "Proveedor", "N° Comprobante", "Categoría", "Descripción", "Monto ($)"],
      ...expenses.map((e, i) => [i + 1, e.fecha, e.proveedor, e.numero_comprobante, e.categoria, e.descripcion, parseFloat(e.monto) || 0]),
      [],
      ["", "", "", "", "", "TOTAL:", `=SUM(G7:G${6 + expenses.length})`],
    ];

    const ws1 = XLSX.utils.aoa_to_sheet(detailData);
    ws1["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 30 }, { wch: 18 }, { wch: 18 }, { wch: 35 }, { wch: 15 }];
    ws1["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
    XLSX.utils.book_append_sheet(wb, ws1, "Detalle de Gastos");

    const summaryData = [
      [`RESUMEN POR CATEGORÍA - ${MONTHS[selectedMonth]} ${selectedYear}`],
      [],
      ["Categoría", "Cantidad", "Subtotal ($)", "% del Total"],
      ...byCategory.map(({ cat, total }) => [
        cat,
        expenses.filter(e => e.categoria === cat).length,
        total,
        totalAmount > 0 ? (total / totalAmount * 100).toFixed(1) + "%" : "0%",
      ]),
      [],
      ["TOTAL GENERAL", expenses.length, totalAmount, "100%"],
    ];

    const ws2 = XLSX.utils.aoa_to_sheet(summaryData);
    ws2["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 14 }];
    ws2["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    XLSX.utils.book_append_sheet(wb, ws2, "Resumen");

    const filename = `Viaticos_${employee.name.replace(/\s/g, "_") || "Empleado"}_${MONTHS[selectedMonth]}_${selectedYear}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast(`✓ Excel exportado: ${filename}`);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #0a1628 0%, #12233d 50%, #0d1f35 100%)", fontFamily: "'Georgia', serif", color: "#e8dcc8" }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9999,
          background: toast.type === "warn" ? "#7a4800" : "#0f4c2a",
          color: "#fff", padding: "14px 22px", borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)", fontSize: 14, fontFamily: "system-ui",
          border: `1px solid ${toast.type === "warn" ? "#c47b00" : "#1a8c4e"}`,
        }}>{toast.msg}</div>
      )}

      {/* API Key Modal */}
      {showKeyInput && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9998, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#12233d", border: "1px solid rgba(174,214,241,0.2)", borderRadius: 16, padding: 32, width: 420, maxWidth: "90vw" }}>
            <div style={{ fontSize: 18, color: "#aed6f1", marginBottom: 8, fontWeight: "bold" }}>🔑 API Key de Anthropic</div>
            <div style={{ fontSize: 13, color: "#7fb3d3", marginBottom: 20, lineHeight: 1.6 }}>
              Necesitás una API Key de Anthropic para usar la extracción con IA.<br />
              Conseguila gratis en <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{ color: "#2e86c1" }}>console.anthropic.com</a><br />
              <span style={{ color: "#5d8aa8", fontSize: 12 }}>Se guarda solo en tu navegador, nunca se envía a ningún servidor.</span>
            </div>
            <input
              type="password"
              placeholder="sk-ant-..."
              defaultValue={apiKey}
              id="apikey-input"
              style={{ ...inputStyle, marginBottom: 16 }}
            />
            <div style={{ display: "flex", gap: 12 }}>
              <button onClick={() => { const v = document.getElementById("apikey-input").value; if (v) saveApiKey(v); }}
                style={{ ...btnStyle("#1B4F72", "#2e86c1"), flex: 1, justifyContent: "center" }}>
                Guardar
              </button>
              <button onClick={() => setShowKeyInput(false)}
                style={{ ...btnStyle("transparent", "#666"), justifyContent: "center" }}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(90deg, #1B4F72 0%, #154360 100%)", padding: "20px 32px", borderBottom: "2px solid #2e86c1", display: "flex", alignItems: "center", justifyContent: "space-between", boxShadow: "0 4px 24px rgba(0,0,0,0.4)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ fontSize: 36 }}>📋</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: "bold", color: "#aed6f1", letterSpacing: 1 }}>Liquidación de Viáticos</div>
            <div style={{ fontSize: 11, color: "#7fb3d3", letterSpacing: 2, textTransform: "uppercase" }}>Sistema con IA · Exporta a Excel</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={() => setShowKeyInput(true)} style={{ ...btnStyle("rgba(0,0,0,0.3)", "#2e86c1"), fontSize: 12, padding: "8px 14px" }}>
            🔑 API Key
          </button>
          {installPrompt && !isInstalled && (
            <button onClick={handleInstall} style={{
              padding: "10px 18px", background: "linear-gradient(135deg, #e67e22, #d35400)",
              border: "none", borderRadius: 8, color: "#fff", cursor: "pointer",
              fontSize: 13, fontWeight: "bold", fontFamily: "system-ui",
              boxShadow: "0 4px 16px rgba(230,126,34,0.4)", display: "flex", alignItems: "center", gap: 8,
              animation: "pulse 2s infinite",
            }}>
              📲 Instalar en escritorio
            </button>
          )}
          {isInstalled && <span style={{ fontSize: 12, color: "#27ae60" }}>✓ App instalada</span>}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}>

        {/* Employee + Period */}
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(174,214,241,0.15)", borderRadius: 14, padding: "22px 24px", marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#7fb3d3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 16 }}>Datos del Empleado y Período</div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 14 }}>
            {[{ label: "Nombre y Apellido", field: "name" }, { label: "Departamento", field: "department" }, { label: "Cargo", field: "position" }].map(({ label, field }) => (
              <div key={field}>
                <label style={{ display: "block", fontSize: 11, color: "#7fb3d3", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>{label}</label>
                <input value={employee[field]} onChange={e => setEmployee(p => ({ ...p, [field]: e.target.value }))} style={inputStyle} placeholder={label} />
              </div>
            ))}
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#7fb3d3", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Mes</label>
              <select value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)} style={inputStyle}>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: "#7fb3d3", marginBottom: 5, textTransform: "uppercase", letterSpacing: 1 }}>Año</label>
              <select value={selectedYear} onChange={e => setSelectedYear(+e.target.value)} style={inputStyle}>
                {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Upload Zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          style={{
            border: `2px dashed ${dragOver ? "#2e86c1" : "rgba(174,214,241,0.25)"}`,
            borderRadius: 14, padding: "32px 24px", textAlign: "center", marginBottom: 24,
            background: dragOver ? "rgba(46,134,193,0.08)" : "rgba(255,255,255,0.02)",
            transition: "all 0.2s",
          }}
        >
          {loading ? (
            <div>
              <div style={{ fontSize: 36, marginBottom: 10 }}>⚙️</div>
              <div style={{ color: "#7fb3d3", fontSize: 15, fontFamily: "system-ui" }}>{loadingMsg}</div>
              <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                <div style={{ width: 200, height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: "60%", background: "#2e86c1", borderRadius: 4, animation: "slide 1.5s infinite" }} />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 44, marginBottom: 10 }}>📄</div>
              <div style={{ fontSize: 16, color: "#aed6f1", marginBottom: 6, fontWeight: "bold" }}>Cargá tus comprobantes</div>
              <div style={{ fontSize: 13, color: "#7fb3d3", marginBottom: 18, fontFamily: "system-ui" }}>La IA extrae los datos automáticamente · Fotos y PDFs</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
                <button onClick={() => fileInputRef.current.click()} style={btnStyle("#1B4F72", "#2e86c1")}>📁 Cargar archivo</button>
                <button onClick={() => cameraInputRef.current.click()} style={btnStyle("#1a3a1a", "#27ae60")}>📷 Sacar foto</button>
                <button onClick={() => setExpenses(p => [...p, { id: Date.now(), proveedor: "", fecha: "", monto: 0, categoria: "Otros", descripcion: "", numero_comprobante: "", fileName: "" }])} style={btnStyle("#3d2b00", "#e67e22")}>✏️ Manual</button>
              </div>
              <div style={{ fontSize: 11, color: "#5d8aa8", marginTop: 12, fontFamily: "system-ui" }}>PNG · JPG · PDF · Arrastrá y soltá</div>
            </>
          )}
        </div>

        <input ref={fileInputRef} type="file" accept="image/*,.pdf" multiple style={{ display: "none" }} onChange={e => handleFiles(Array.from(e.target.files))} />
        <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={e => handleFiles(Array.from(e.target.files))} />

        {/* Expenses Table */}
        {expenses.length > 0 && (
          <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(174,214,241,0.12)", borderRadius: 14, overflow: "hidden", marginBottom: 24 }}>
            <div style={{ padding: "14px 22px", borderBottom: "1px solid rgba(174,214,241,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "#aed6f1", fontWeight: "bold", fontSize: 15, fontFamily: "system-ui" }}>Comprobantes ({expenses.length})</span>
              <span style={{ color: "#7fb3d3", fontSize: 12, fontFamily: "system-ui" }}>Hacé clic en cualquier celda para editar</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "rgba(27,79,114,0.4)" }}>
                    {["#", "Fecha", "Proveedor", "N° Comp.", "Categoría", "Descripción", "Monto ($)", ""].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#7fb3d3", fontWeight: "600", fontSize: 11, textTransform: "uppercase", letterSpacing: 1, whiteSpace: "nowrap", fontFamily: "system-ui" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e, i) => (
                    <tr key={e.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)" }}>
                      <td style={{ padding: "8px 12px", color: "#5d8aa8", fontFamily: "system-ui" }}>{i + 1}</td>
                      <td style={{ padding: "5px 6px" }}><input value={e.fecha} onChange={ev => updateExpense(e.id, "fecha", ev.target.value)} placeholder="DD/MM/YYYY" style={{ ...cellInputStyle, width: 100 }} /></td>
                      <td style={{ padding: "5px 6px" }}><input value={e.proveedor} onChange={ev => updateExpense(e.id, "proveedor", ev.target.value)} placeholder="Proveedor" style={{ ...cellInputStyle, width: 150 }} /></td>
                      <td style={{ padding: "5px 6px" }}><input value={e.numero_comprobante} onChange={ev => updateExpense(e.id, "numero_comprobante", ev.target.value)} placeholder="N°" style={{ ...cellInputStyle, width: 80 }} /></td>
                      <td style={{ padding: "5px 6px" }}>
                        <select value={e.categoria} onChange={ev => updateExpense(e.id, "categoria", ev.target.value)} style={{ ...cellInputStyle, width: 130 }}>
                          {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: "5px 6px" }}><input value={e.descripcion} onChange={ev => updateExpense(e.id, "descripcion", ev.target.value)} placeholder="Descripción" style={{ ...cellInputStyle, width: 190 }} /></td>
                      <td style={{ padding: "5px 6px" }}><input type="number" value={e.monto} onChange={ev => updateExpense(e.id, "monto", ev.target.value)} style={{ ...cellInputStyle, width: 100, textAlign: "right" }} /></td>
                      <td style={{ padding: "5px 6px" }}>
                        <button onClick={() => removeExpense(e.id)} style={{ background: "rgba(231,76,60,0.15)", border: "1px solid rgba(231,76,60,0.3)", color: "#e74c3c", borderRadius: 6, padding: "4px 10px", cursor: "pointer", fontSize: 14 }}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Summary + Export */}
        {expenses.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(174,214,241,0.12)", borderRadius: 14, padding: "20px 22px" }}>
              <div style={{ fontSize: 11, color: "#7fb3d3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 14, fontFamily: "system-ui" }}>Resumen por categoría</div>
              {byCategory.map(({ cat, total }) => (
                <div key={cat} style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 13, color: "#e8dcc8", fontFamily: "system-ui" }}>{cat}</span>
                    <span style={{ fontSize: 13, color: "#aed6f1", fontFamily: "monospace" }}>$ {formatCurrency(total)}</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.08)", borderRadius: 4 }}>
                    <div style={{ height: "100%", borderRadius: 4, background: "linear-gradient(90deg, #1B4F72, #2e86c1)", width: `${totalAmount > 0 ? (total / totalAmount * 100) : 0}%`, transition: "width 0.5s ease" }} />
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(174,214,241,0.15)", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: "bold", color: "#aed6f1", fontFamily: "system-ui" }}>TOTAL</span>
                <span style={{ fontWeight: "bold", color: "#2ecc71", fontSize: 18, fontFamily: "monospace" }}>$ {formatCurrency(totalAmount)}</span>
              </div>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(174,214,241,0.12)", borderRadius: 14, padding: "20px 22px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 11, color: "#7fb3d3", textTransform: "uppercase", letterSpacing: 2, marginBottom: 14, fontFamily: "system-ui" }}>Exportar liquidación</div>
                <div style={{ fontSize: 13, color: "#aed6f1", lineHeight: 2, fontFamily: "system-ui" }}>
                  📊 Detalle con todos los comprobantes<br />
                  📈 Resumen por categoría<br />
                  💰 Totales y porcentajes<br />
                  🏷️ Datos del empleado incluidos
                </div>
              </div>
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, color: "#5d8aa8", marginBottom: 10, fontFamily: "system-ui" }}>
                  {expenses.length} comprobante{expenses.length !== 1 ? "s" : ""} · {MONTHS[selectedMonth]} {selectedYear}
                </div>
                <button onClick={exportToExcel} style={{
                  width: "100%", padding: "14px", fontSize: 15, fontWeight: "bold",
                  background: "linear-gradient(135deg, #1a6b3c, #27ae60)",
                  border: "none", borderRadius: 10, color: "#fff", cursor: "pointer",
                  letterSpacing: 1, boxShadow: "0 4px 20px rgba(39,174,96,0.3)", fontFamily: "system-ui",
                }}>
                  ⬇ Descargar Excel
                </button>
              </div>
            </div>
          </div>
        )}

        {expenses.length === 0 && !loading && (
          <div style={{ textAlign: "center", padding: "48px 0", color: "#5d8aa8", fontFamily: "system-ui" }}>
            <div style={{ fontSize: 60, marginBottom: 14, opacity: 0.4 }}>🧾</div>
            <div style={{ fontSize: 16 }}>Cargá el primer comprobante para comenzar</div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }
        @keyframes pulse { 0%,100% { box-shadow: 0 4px 16px rgba(230,126,34,0.4); } 50% { box-shadow: 0 4px 28px rgba(230,126,34,0.7); } }
        input::placeholder { color: rgba(93,138,168,0.5) !important; }
        select option { background: #12233d; color: #e8dcc8; }
        * { box-sizing: border-box; }
      `}</style>
    </div>
  );
}
