import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, Lock, Eye, User, Plus, AlertTriangle, Clock, CheckCircle2,
  X, Zap, ArrowUp, Trash2, ChevronRight, Search
} from "lucide-react";

const APCS = ["Dare", "Ope", "Lambo", "Ayo", "Ebuka", "Ezekiel"];
const CONTACTS = ["Ghiazat", "Vincent", "Matthew", "QD"];
const POLL_MS = 5000;
const REWORK_CATEGORIES = ["Frame", "Canvas", "TBR", "Other"];
const REWORK_STATUSES = ["PENDING", "IN_PROGRESS", "DONE"];
const TRACK_MATERIALS = ["Frame", "Glass", "Mat Board", "Foam Board", "Hardboard", "Canvas", "Stretcher", "Bracing", "Other"];
const INSTALL_STATUSES = ["PENDING", "ASSIGNED", "ON_THE_WAY", "INSTALLING", "COMPLETED"];

const SIZES = ["10x12", "12x16", "16x20", "18x24", "20x28", "24x36", "34x46", "36x47.5", "36x48", "Other"];
const FRAME_RECOMMEND = {
  "10x12": "2022", "12x16": "2022", "16x20": "2022",
  "18x24": "2030", "20x28": "2030", "24x36": "2030",
  "34x46": "2030", "36x47.5": "2030", "36x48": "2030",
};
const COLOURS = [
  ["B", "Black"], ["W", "White"], ["DB", "Dark Brown"], ["MOB", "Mocha Brown"], ["LB", "Light Brown"],
  ["GD", "Gold"], ["RD", "Red"], ["SG", "Stain Gold"], ["GR", "Gray"], ["SL", "Silver"],
];
const FRAMING_STYLES = ["Normal Framing", "Double Glass", "Float Mounting", "Shadowbox", "Other"];
const MAT_COLOURS = ["White", "Cream", "Black", "Custom"];
const MATTING_STD = ["0.5\"", "1\"", "1.5\"", "2\"", "Custom"];
const CANVAS_QUALITY = ["HQ", "SQ"];
const CANVAS_STYLE = ["S+F", "SO", "Other"];
const STRETCHER = ["1727", "2030", "2035"];
const STRETCHER_LABELS = STRETCHER.map((s) => `${s} — ${s === "2030" ? "Slope" : "No slope"}`);
const TBR_CATEGORIES = ["Canvas", "Image", "Item", "Other"];
const DELAY_REASONS = ["Image/Print", "Material", "Frame", "Glass", "Mat Board", "Foam Board", "Hardboard", "Canvas", "Water Taping", "Other"];
const JOB_TYPES = ["Framed", "Canvas", "Item", "Other"];
const FRAMED_MATERIAL_OPTIONS = ["Frame", "Glass", "Mat Board", "Foam Board", "Hardboard", "Bracing"];
const CANVAS_MATERIAL_OPTIONS = ["Frame", "Stretcher", "Canvas", "Foam Board", "Hardboard", "Mat Board", "Glass", "Bracing"];
const TBR_MATERIAL_OPTIONS = ["Frame", "Glass", "Mat Board", "Foam Board", "Hardboard", "Bracing", "Stretcher", "Canvas", "Other"];

// ---------- inventory constants ----------
const INV_CATEGORIES = ["Frame", "Glass", "Mat Board", "Hardboard", "Foam Board", "Bracing", "Stretcher"];
const INV_SIZED_CATEGORIES = ["Frame", "Glass", "Mat Board", "Hardboard", "Foam Board"]; 
const INV_STANDARD_SIZES = ["10x12", "12x16", "16x20", "18x24", "20x28", "24x36", "34x46", "36x47.5", "36x48"];
const FULL_SHEET_MATERIALS = ["Glass", "Hardboard", "Foam Board", "Mat Board"];
const MOVEMENT_REASONS = ["Restock", "Production", "Manual Adjustment", "Job Cut"];
const HARDBOARD_ORIENTATION_SIZES = ["18x24", "20x28", "24x36"]; 
const LAID_FOAM_MAT_TYPES = [["1in", "1\""], ["1_5in", "1.5\""], ["2in", "2\""]];
const LAID_FOAM_FULL_SIZES = INV_STANDARD_SIZES.filter((s) => s !== "36x48" && s !== "36x47.5");

function invItemId(category, kind, size) {
  const cat = category.replace(/\s+/g, "").toLowerCase();
  const sz = (size || "na").replace(/\s+/g, "").toLowerCase();
  return `${cat}_${kind}_${sz}`;
}

// ---------- storage layer ----------
async function safeGet(key) {
  try { const r = await window.storage.get(key, true); return r ? JSON.parse(r.value) : null; }
  catch (e) { console.error("storage.get failed", key, e); return null; }
}
async function safeSet(key, value, attempt = 0) {
  let json;
  try { json = JSON.stringify(value); } catch (e) { return { ok: false, reason: "serialize", detail: String(e?.message || e) }; }
  try {
    if (typeof window === "undefined" || !window.storage) { return { ok: false, reason: "unavailable", detail: "Storage bridge not ready yet." }; }
    await window.storage.set(key, json, true);
    return { ok: true };
  } catch (e) {
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      return safeSet(key, value, attempt + 1);
    }
    console.error("storage.set failed", key, e);
    return { ok: false, reason: "storage", detail: String(e?.message || e) };
  }
}
async function listKeys(prefix) {
  try { const r = await window.storage.list(prefix, true); return r?.keys || []; }
  catch (e) { console.error("storage.list failed", prefix, e); return []; }
}
async function listJobKeys() { return listKeys("job:"); }

// ---------- inventory storage ----------
async function loadRecords(prefix) {
  const keys = await listKeys(prefix);
  const results = (await Promise.all(keys.map(safeGet))).filter(Boolean);
  return results.sort((a, b) => b.createdAt - a.createdAt);
}
async function loadReworks() {
  const keys = await listKeys("rework:");
  const results = (await Promise.all(keys.map(safeGet))).filter(Boolean);
  return results.sort((a, b) => b.createdAt - a.createdAt);
}
async function loadInventory() {
  const itemKeys = await listKeys("inv:item:");
  const items = (await Promise.all(itemKeys.map(safeGet))).filter(Boolean);
  const moveKeys = await listKeys("stockmove:");
  const moves = (await Promise.all(moveKeys.map(safeGet))).filter(Boolean);
  const stockByItem = {};
  for (const m of moves) stockByItem[m.itemId] = (stockByItem[m.itemId] || 0) + m.qtyChange;
  return { items, moves, stockByItem };
}
async function ensureInventoryItem(itemId, meta) {
  const existing = await safeGet(`inv:item:${itemId}`);
  if (existing) return existing;
  const item = { id: itemId, unit: "pcs", threshold: 5, createdAt: Date.now(), ...meta };
  await safeSet(`inv:item:${itemId}`, item);
  return item;
}
async function recordMovement(itemId, qtyChange, reason, person, jobId, jobRef) {
  const ts = Date.now();
  const key = `stockmove:${itemId}:${ts}_${Math.random().toString(36).slice(2, 6)}`;
  return safeSet(key, { itemId, qtyChange, reason, person, timestamp: ts, jobId: jobId || null, jobRef: jobRef || null });
}
function stockStatus(stock, threshold) {
  if (stock <= 0) return "OUT";
  if (stock <= threshold) return "LOW";
  return "READY";
}
function newId(prefix) { return prefix + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7); }
function elapsed(ts, now = Date.now()) {
  if (!ts) return "—";
  const mins = Math.floor((now - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
// Upgraded calculation logic safely wrapping negative offsets
function formatHMS(ms) {
  const safeMs = (!ms || ms < 0) ? 0 : ms;
  const totalSec = Math.floor(safeMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function materialsFor(jobType) {
  if (jobType === "Framed") return ["Frame", "Glass", "Mat Board", "Foam Board", "Hardboard"];
  if (jobType === "Canvas") return ["Canvas", "Stretcher", "Frame / finishing materials"];
  return ["General materials as applicable"];
}
const STATUS_BADGE = {
  ACTIVE: { label: "In Production", cls: "bg-neutral-800 text-neutral-400" },
  READY_FOR_FULFILLMENT: { label: "Ready for Fulfillment", cls: "bg-amber-500/20 text-amber-400" },
  IN_FULFILLMENT: { label: "In Fulfillment", cls: "bg-blue-500/20 text-blue-400" },
  COMPLETED: { label: "Completed", cls: "bg-emerald-500/20 text-emerald-400" },
};
const LARGE_SIZES = ["34x46", "36x47.5", "36x48"];
function requiredMaterials(job) {
  const base = materialsFor(job.jobType || "Framed");
  const needsBracing = (job.jobType === "Framed") && job.sizeLines.some((l) => LARGE_SIZES.includes(l.size));
  return needsBracing ? [...base, "Bracing"] : base;
}
function materialsStatusForJob(job, stockByItem, items) {
  const results = [];
  const types = getJobTypes(job);
  const lookup = (category, size) => {
    const id = invItemId(category, "sized", size);
    const stock = stockByItem[id] || 0;
    const meta = items.find((i) => i.id === id);
    return stockStatus(stock, meta?.threshold ?? 5);
  };
  const lookupCustom = (category, sizeLabel, neededQty = 1) => {
    const id = invItemId(category, "custom", sizeLabel);
    const meta = items.find((i) => i.id === id);
    if (!meta) return "REQUIRED"; 
    const stock = stockByItem[id] || 0;
    if (stock <= 0) return "OUT";
    if (stock < neededQty) return "INSUFFICIENT";
    return "READY";
  };

  if (types.framed) {
    const selected = job.framed?.materials || requiredMaterials(job);
    const standardSizes = [...new Set(job.sizeLines.map((l) => (l.size === "Other" ? null : l.size)).filter(Boolean))];
    const customQtyMap = {};
    job.sizeLines.filter((l) => l.size === "Other" && l.customSize.trim()).forEach((l) => {
      const key = l.customSize.trim();
      customQtyMap[key] = (customQtyMap[key] || 0) + (l.qty || 1);
    });
    for (const mat of selected) {
      if (mat === "Bracing") { results.push({ label: "Bracing [Framed]", status: lookup("Bracing", "na") }); continue; }
      for (const size of standardSizes) results.push({ label: `${mat} @ ${size} [Framed]`, status: lookup(mat, size) });
      for (const [size, qty] of Object.entries(customQtyMap)) {
        results.push({ label: `${mat} @ ${size} (custom) [Framed]`, status: lookupCustom(mat, size, qty) });
      }
    }
  }
  if (types.canvas) {
    const selected = job.canvas?.materials || ["Frame", "Stretcher"];
    const frameSize = job.canvas?.frameCutting?.size?.trim();
    const stretcherSize = job.canvas?.stretcherCutting?.size?.trim();
    const fallbackSize = frameSize || stretcherSize;
    for (const mat of selected) {
      if (mat === "Canvas") continue; 
      if (mat === "Stretcher") {
        if (stretcherSize) results.push({ label: `Stretcher @ ${stretcherSize} (custom) [Canvas]`, status: lookupCustom("Stretcher", stretcherSize, job.canvas.stretcherCutting.qty || 1) });
continue;}if (mat === "Frame") {if (frameSize) results.push({ label: Frame @ ${frameSize} (custom) [Canvas], status: lookupCustom("Frame", frameSize, job.canvas.frameCutting.qty || 1) });continue;}if (fallbackSize) results.push({ label: ${mat} @ ${fallbackSize} (custom) [Canvas], status: lookupCustom(mat, fallbackSize) });}}if (types.tbr) {const tbrCats = getTbrCategories(job);const imageSize = tbrCats.includes("Image") ? job.tbr?.imageSub?.size?.trim() : null;const tbrFrameSize = tbrCats.includes("Canvas") ? job.tbr?.canvasSub?.frameCutting?.size?.trim() : null;const tbrStretcherSize = tbrCats.includes("Canvas") ? job.tbr?.canvasSub?.stretcherCutting?.size?.trim() : null;for (const mat of job.tbr?.materials || []) {if (mat === "Canvas") continue;if (imageSize) { results.push({ label: ${mat} @ ${imageSize} (custom) [TBR-Image], status: lookupCustom(mat, imageSize) }); continue; }if (mat === "Stretcher" && tbrStretcherSize) { results.push({ label: Stretcher @ ${tbrStretcherSize} (custom) [TBR-Canvas], status: lookupCustom("Stretcher", tbrStretcherSize, job.tbr.canvasSub.stretcherCutting.qty || 1) }); continue; }if (mat === "Frame" && tbrFrameSize) { results.push({ label: Frame @ ${tbrFrameSize} (custom) [TBR-Canvas], status: lookupCustom("Frame", tbrFrameSize, job.tbr.canvasSub.frameCutting.qty || 1) }); continue; }results.push({ label: ${mat} [TBR], status: lookup(mat, "na") });}}return results;}function bottleneckOf(job) {if (job.materials === "MISSING") return { label: "WAITING FOR MATERIAL", stage: "materials" };if (job.imageStatus === "WAITING") return { label: "WAITING FOR IMAGE", stage: "image" };if (job.assembly !== "DONE") return { label: job.assembly === "IN_PROGRESS" ? "ASSEMBLY IN PROGRESS" : "ASSEMBLY PENDING", stage: "assembly" };if (job.fulfillment.status === "PENDING") return { label: "FULFILLMENT", stage: "fulfillment" };if (job.fulfillment.status === "IN_FULFILLMENT") return { label: "FULFILLMENT — IN PROGRESS", stage: "fulfillment" };if (job.fulfillment.status === "WATER_TAPING") return { label: "WATER TAPING", stage: "fulfillment" };return { label: "COMPLETED", stage: "done" };}function computeStatus(job) {const productionDone = job.materials === "READY" && job.imageStatus === "READY" && job.assembly === "DONE";if (!productionDone) return "ACTIVE";if (job.fulfillment.status === "COMPLETED") return "COMPLETED";if (job.fulfillment.status === "IN_FULFILLMENT" || job.fulfillment.status === "WATER_TAPING") return "IN_FULFILLMENT";return "READY_FOR_FULFILLMENT";}function defaultJob(apcName) {return {id: newId("job"), clientName: "", jobRef: "", quantity: 1,jobTypes: { framed: true, canvas: false, tbr: false },sizeLines: [{ id: newId("sl"), size: "12x16", customSize: "", colours: [], frameType: "2022", frameTypeCustom: "", frameTypeTouched: false, qty: 1 }],framed: {paperType: "PLP", paperTypeCustom: "", framingStyles: ["Normal Framing"], framingStyleCustom: "",matColour: "White", matColourCustom: "", mattingStyle: "1"", mattingCustom: "",materials: ["Frame", "Glass", "Mat Board", "Foam Board", "Hardboard"]},canvas: {quality: "HQ", size: "", qty: 1, style: "S+F", styleCustom: "", stretcher: "1727", frameSpec: "",materials: ["Frame", "Stretcher"], stretcherCutting: { size: "", qty: 1 }, frameCutting: { size: "", qty: 1 }},tbr: {active: false, categories: [], kinds: { IN: false, ER: false }, materials: [],canvasSub: { size: "", style: "S+F", styleCustom: "", stretcher: "1727", frameSpec: "", stretcherCutting: { size: "", qty: 1 }, frameCutting: { size: "", qty: 1 } },imageSub: { size: "", frameSpec: "" }, itemSub: { description: "", size: "", frameSpec: "", notes: "" }, otherSub: { notes: "" }},priority: "normal", expressStartedAt: null, notes: "", materials: "MISSING", imageStatus: "READY",imageWaitingSince: null, imageRequests: [], delayed: { active: false, reason: "", customReason: "" },assembly: "NOT_STARTED", waterTaping: { status: "NOT_READY", doneAt: null, doneBy: null },fulfillment: { status: "PENDING", startedAt: null, startedBy: null, completedAt: null, completedBy: null },managementMessages: [], createdAt: Date.now(), createdBy: apcName, lastUpdatedBy: apcName, updatedAt: Date.now()};}function getJobTypes(job) { return job.jobTypes || { framed: job.jobType !== "Canvas", canvas: job.jobType === "Canvas", tbr: !!job.tbr?.active }; }function getTbrCategories(job) { return job.tbr?.categories || (job.tbr?.category ? [job.tbr.category] : []); }function getTbrKinds(job) { return job.tbr?.kinds || (job.tbr?.kind ? { [job.tbr.kind]: true } : { IN: false, ER: false }); }// ---------------- MAIN EXPORT COMPONENT ----------------export default function FrameGidiApp() {const [role, setRole] = useState(null);const [apcName, setApcName] = useState(APCS[0]);const [jobs, setJobs] = useState([]);const [loading, setLoading] = useState(false);const [lastSynced, setLastSynced] = useState(null);const [error, setError] = useState(null);const [showForm, setShowForm] = useState(false);const [editingJob, setEditingJob] = useState(null);const [activeTab, setActiveTab] = useState("dashboard");const [filter, setFilter] = useState("All");const [search, setSearch] = useState("");const [now, setNow] = useState(Date.now());const [inventoryItems, setInventoryItems] = useState([]);const [stockByItem, setStockByItem] = useState({});const [inventoryMoves, setInventoryMoves] = useState([]);const [reworks, setReworks] = useState([]);const [cutRecords, setCutRecords] = useState([]);const [coupleRecords, setCoupleRecords] = useState([]);const [installRecords, setInstallRecords] = useState([]);const [activeModule, setActiveModule] = useState("production");const pollRef = useRef(null);const invPollRef = useRef(null);const reworkPollRef = useRef(null);const trackPollRef = useRef(null);const tickRef = useRef(null);useEffect(() => {tickRef.current = setInterval(() => setNow(Date.now()), 1000);return () => clearInterval(tickRef.current);}, []);const loadJobs = useCallback(async (silent) => {if (!silent) setLoading(true);setError(null);try {const keys = await listJobKeys();const results = await Promise.all(keys.map(safeGet));setJobs(results.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt));setLastSynced(Date.now());} catch { setError("Could not reach shared storage. Retrying on next sync."); }finally { setLoading(false); }}, []);const loadInv = useCallback(async () => {const { items, stockByItem: stock, moves } = await loadInventory();setInventoryItems(items);setStockByItem(stock);setInventoryMoves(moves);}, []);const loadReworkList = useCallback(async () => { setReworks(await loadReworks()); }, []);const loadTracking = useCallback(async () => {setCutRecords(await loadRecords("cut:"));setCoupleRecords(await loadRecords("couple:"));}, []);const loadInstalls = useCallback(async () => { setInstallRecords(await loadRecords("install:")); }, []);useEffect(() => {if (!role) return;loadJobs(false); loadInv(); loadReworkList(); loadTracking(); loadInstalls();pollRef.current = setInterval(() => loadJobs(true), POLL_MS);invPollRef.current = setInterval(loadInv, POLL_MS);reworkPollRef.current = setInterval(loadReworkList, POLL_MS);trackPollRef.current = setInterval(() => { loadTracking(); loadInstalls(); }, POLL_MS);return () => {clearInterval(pollRef.current); clearInterval(invPollRef.current);clearInterval(reworkPollRef.current); clearInterval(trackPollRef.current);};}, [role, loadJobs, loadInv, loadReworkList, loadTracking, loadInstalls]);function describePatch(patch, current, jobRef) {if (patch.assembly && patch.assembly !== current.assembly) {const map = { NOT_STARTED: "Not Started", IN_PROGRESS: "Assembly", DONE: "Assembly Done" };return Updated ${jobRef} → ${map[patch.assembly] || patch.assembly};}if (patch.materials && patch.materials !== current.materials) return Updated ${jobRef} → Materials ${patch.materials};if (patch.fulfillment && patch.fulfillment.status === "WATER_TAPING" && current.fulfillment.status !== "WATER_TAPING") return Updated ${jobRef} → Fulfillment: Water Taping;if (patch.delayed && patch.delayed.active && !current.delayed.active) return Flagged ${jobRef} blocked by ${patch.delayed.reason};if (patch.delayed && patch.delayed.active === false && current.delayed.active) return Cleared blocker on ${jobRef};if (patch.imageRequests && patch.imageRequests.length > current.imageRequests.length) {const last = patch.imageRequests[patch.imageRequests.length - 1];if (last.requestedBy === "HR" && last.note === "Acknowledged") return HR acknowledged image request for ${jobRef};return Requested print update on ${jobRef} from ${last.contact};}if (patch.imageStatus === "READY" && current.imageStatus === "WAITING") return Image marked ready for ${jobRef};return null;}async function logActivity(action, job, actor = apcName) {const ts = Date.now();await safeSet(activity:${ts}_${Math.random().toString(36).slice(2, 6)}, {person: actor, timestamp: ts, jobId: job.id, jobRef: job.jobRef || job.clientName, action});}async function saveJob(job, activityLabel, actor = apcName) {const oldStatus = job.status;job.quantity = job.sizeLines.reduce((sum, l) => sum + (l.qty || 0), 0);job.status = computeStatus(job);job.updatedAt = Date.now();job.lastUpdatedBy = actor;const result = await safeSet(job:${job.id}, job);if (result.ok) {if (activityLabel) logActivity(activityLabel, job, actor);if (oldStatus !== "READY_FOR_FULFILLMENT" && job.status === "READY_FOR_FULFILLMENT") logActivity(${job.jobRef || job.clientName} → Ready for Fulfillment, job, actor);if (oldStatus !== "IN_FULFILLMENT" && job.status === "IN_FULFILLMENT") logActivity("Fulfillment started", job, actor);if (oldStatus !== "COMPLETED" && job.status === "COMPLETED") logActivity(Completed ${job.jobRef || job.clientName} → Completed, job, actor);loadJobs(true);} else {setError(result.reason === "unavailable" ? "Storage isn't ready yet — wait a moment and try Save again." : Save failed (${result.reason}): ${result.detail});}return result.ok;}async function patchJob(jobId, patch, actor = apcName) {const current = await safeGet(job:${jobId});if (!current) { setError("Job no longer exists — refreshing."); return loadJobs(true); }const updated = { ...current, ...patch };const jobRef = current.jobRef || current.clientName;const activityLabel = describePatch(patch, current, jobRef);if (patch.imageStatus && patch.imageStatus !== current.imageStatus) {if (patch.imageStatus === "WAITING") updated.imageWaitingSince = Date.now();else if (patch.imageStatus === "READY") updated.imageWaitingSince = null;}if (patch.priority && patch.priority === "express" && current.priority !== "express") updated.expressStartedAt = Date.now();if (patch.fulfillment && patch.fulfillment.status !== current.fulfillment.status) {if (patch.fulfillment.status === "IN_FULFILLMENT") updated.fulfillment = { ...updated.fulfillment, startedAt: Date.now(), startedBy: actor };else if (patch.fulfillment.status === "COMPLETED") updated.fulfillment = { ...updated.fulfillment, completedAt: Date.now(), completedBy: actor };}await saveJob(updated, activityLabel);}async function saveJobEdits(jobId, formJob) {const current = await safeGet(job:${jobId});if (!current) { setError("Job no longer exists — refreshing."); return loadJobs(true); }const merged = {...current, clientName: formJob.clientName, jobRef: formJob.jobRef, jobTypes: formJob.jobTypes,sizeLines: formJob.sizeLines, framed: formJob.framed, canvas: formJob.canvas, tbr: formJob.tbr,notes: formJob.notes, priority: formJob.priority};if (formJob.priority === "express" && current.priority !== "express") merged.expressStartedAt = Date.now();return saveJob(merged);}async function adjustStock(itemId, meta, qtyChange, reason, jobId, jobRef) {await ensureInventoryItem(itemId, meta);const result = await recordMovement(itemId, qtyChange, reason, apcName, jobId, jobRef);if (!result.ok) setError(Stock update failed (${result.reason}): ${result.detail});else loadInv();return result.ok;}async function setThreshold(itemId, meta, threshold) {const item = await ensureInventoryItem(itemId, meta);const result = await safeSet(inv:item:${itemId}, { ...item, threshold, updatedAt: Date.now(), updatedBy: apcName });if (!result.ok) setError(Threshold update failed (${result.reason}): ${result.detail});else loadInv();return result.ok;}function findJobsForCustomSize(sizeLabel) {const q = sizeLabel.trim().toLowerCase();if (!q) return [];return jobs.filter((j) => j.status !== "COMPLETED" && j.sizeLines.some((l) => l.size === "Other" && l.customSize.trim().toLowerCase() === q));}async function recordCustomCut(category, sizeLabel, qty, job) {const itemId = invItemId(category, "custom", sizeLabel);await ensureInventoryItem(itemId, { category, kind: "custom", size: sizeLabel, createdBy: apcName });const result = await recordMovement(itemId, qty, "Job Cut", apcName, job?.id, job?.jobRef || job?.clientName);if (!result.ok) setError(Cut record failed (${result.reason}): ${result.detail});else loadInv();return result.ok;}async function addManagementMessage(jobId, text) {const current = await safeGet(job:${jobId});if (!current) { setError("Job no longer exists — refreshing."); return loadJobs(true); }const messages = [...(current.managementMessages || []), { text, by: "Management/QD", at: Date.now() }];return saveJob({ ...current, managementMessages: messages }, Management message added on ${current.jobRef || current.clientName}, "Management/QD");}async function createRework(rework) {const result = await safeSet(rework:${rework.id}, rework);if (!result.ok) setError(Rework save failed (${result.reason}): ${result.detail});else loadReworkList();return result.ok;}async function updateReworkStatus(reworkId, status) {const current = await safeGet(rework:${reworkId});if (!current) { setError("Rework record no longer exists — refreshing."); return loadReworkList(); }const result = await safeSet(rework:${reworkId}, { ...current, status, updatedAt: Date.now(), lastUpdatedBy: apcName });if (!result.ok) setError(Rework update failed (${result.reason}): ${result.detail});else loadReworkList();return result.ok;}async function createCutRecord(rec) {const result = await safeSet(cut:${rec.id}, rec);if (!result.ok) setError(Cutting record failed (${result.reason}): ${result.detail});else loadTracking();return result.ok;}async function createCoupleRecord(rec) {const result = await safeSet(couple:${rec.id}, rec);if (!result.ok) setError(Coupling record failed (${result.reason}): ${result.detail});else loadTracking();return result.ok;}async function saveInstallRecord(rec) {const result = await safeSet(install:${rec.id}, { ...rec, updatedAt: Date.now() });if (!result.ok) setError(Installation save failed (${result.reason}): ${result.detail});else loadInstalls();return result.ok;}if (!role) return <LoginScreen onLogin={(r, name) => { setRole(r); if (name) setApcName(name); }} />;const filtered = jobs.filter((j) => {if (search.trim()) {const q = search.trim().toLowerCase();const sizeMatch = j.sizeLines.some((l) => (l.size === "Other" ? l.customSize : l.size).toLowerCase().includes(q));const matches = j.clientName.toLowerCase().includes(q) || j.jobRef.toLowerCase().includes(q) || sizeMatch;if (!matches) return false;}if (filter === "All") return true;if (filter === "High Priority") return j.priority === "high";if (filter === "Express") return j.priority === "express";if (filter === "Waiting for Image") return j.imageStatus === "WAITING";if (filter === "Delayed") return j.delayed?.active;if (filter === "Water Taping") return j.fulfillment.status === "WATER_TAPING";if (filter === "Ready for Fulfillment") return j.status === "READY_FOR_FULFILLMENT";if (filter === "Fulfillment") return j.status === "IN_FULFILLMENT";if (filter === "Completed") return j.status === "COMPLETED";if (filter === "TBR") return getJobTypes(j).tbr;if (filter === "IN") return getJobTypes(j).tbr && getTbrKinds(j).IN;if (filter === "ER") return getJobTypes(j).tbr && getTbrKinds(j).ER;return true;});return ({html, body { background-color: rgb(10 10 10); margin: 0; padding: 0; } .input{width:100%;border:1px solid rgb(64 64 64);background:rgb(38 38 38);border-radius:0.375rem;padding:0.5rem 0.75rem;font-size:0.875rem;color:rgb(245 245 245)} .input:focus{outline:none;border-color:rgb(245 158 11)} .input::placeholder{color:rgb(115 115 115)} .wheel-scroll::-webkit-scrollbar{display:none}}<TopBar role={role} apcName={apcName} loading={loading} lastSynced={lastSynced} onRefresh={() => loadJobs(false)} onLogout={() => { setRole(null); setJobs([]); setActiveTab("dashboard"); setShowForm(false); setEditingJob(null); }} />{error && ({error})}{(role === "apc" || role === "management") && }{(role === "apc" || role === "management") && activeModule === "production" && }{activeModule === "production" && ({role === "apc" && activeTab === "dashboard" && (<AttentionList jobs={jobs} now={now} onOpenJobs={() => setActiveTab("jobs")} />)}{role === "apc" && activeTab === "jobs" && ({!showForm && !editingJob && (<button onClick={() => setShowForm(true)} className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 py-3 font-semibold text-neutral-950 active:bg-amber-400"> New Order)}{showForm && <JobForm apcName={apcName} mode="create" onCancel={() => setShowForm(false)} onSave={async (job) => { const ok = await saveJob(job); if (ok) setShowForm(false); }} />}{editingJob && <JobForm apcName={apcName} mode="edit" initial={editingJob} onCancel={() => setEditingJob(null)} onSave={async (job) => { const ok = await saveJobEdits(editingJob.id, job); if (ok) setEditingJob(null); }} />}{filtered.length === 0 && }{filtered.map((job) => (<JobCard key={job.id} job={job} apcName={apcName} now={now} editable stockByItem={stockByItem} inventoryItems={inventoryItems} onPatch={(patch) => patchJob(job.id, patch)} onRecordCut={recordCustomCut} onEdit={() => { setEditingJob(job); setShowForm(false); }} />))})}{role === "apc" && activeTab === "rework" && }{role === "apc" && activeTab === "handover" && }{role === "apc" && activeTab === "inventory" && }{role === "management" && activeTab === "dashboard" && ()}{role === "management" && activeTab === "jobs" && ({filtered.length === 0 && }{filtered.map((job) => )})}{role === "management" && activeTab === "rework" && }{role === "management" && activeTab === "handover" && }{role === "management" && activeTab === "inventory" && }</>)}{(role === "apc" || role === "management") && activeModule === "tracking" && (<JobTrackingModule jobs={jobs} apcName={apcName} cutRecords={cutRecords} coupleRecords={coupleRecords} onCreateCut={createCutRecord} onCreateCouple={createCoupleRecord} editable={role === "apc"} />)}{(role === "apc" || role === "management") && activeModule === "installation" && (<InstallationModule jobs={jobs} apcName={apcName} installRecords={installRecords} onSave={saveInstallRecord} editable={role === "apc"} />)}{role === "hr" && <HRView jobs={jobs} onUpdateImage={(jobId, patch) => patchJob(jobId, patch, "HR")} />});}// ---------------- PLATFORM PICKERS & SHARED UI ----------------const WHEEL_ITEM_H = 44;const WHEEL_VISIBLE = 3;function ScrollWheelPicker({ items, value, onChange, itemHeight = WHEEL_ITEM_H, visible = WHEEL_VISIBLE }) {const containerRef = useRef(null);const settleTimer = useRef(null);const didInit = useRef(false);useEffect(() => {if (didInit.current) return;didInit.current = true;const idx = Math.max(0, items.indexOf(value));if (containerRef.current) containerRef.current.scrollTop = idx * itemHeight;}, [items, value, itemHeight]);function settle(scrollTop) {const idx = Math.max(0, Math.min(items.length - 1, Math.round(scrollTop / itemHeight)));containerRef.current?.scrollTo({ top: idx * itemHeight, behavior: "smooth" });if (items[idx] !== value) onChange(items[idx]);}function handleScroll(e) {const scrollTop = e.currentTarget.scrollTop;if (settleTimer.current) clearTimeout(settleTimer.current);settleTimer.current = setTimeout(() => settle(scrollTop), 130);}return (<div className="pointer-events-none absolute left-0 right-0 top-1/2 z-10 -translate-y-1/2 rounded-md border-y-2 border-amber-500" style={{ height: itemHeight }} /><div className="pointer-events-none absolute inset-x-0 top-0 z-10" style={{ height: itemHeight, background: "linear-gradient(to bottom, rgb(23 23 23), transparent)" }} /><div className="pointer-events-none absolute inset-x-0 bottom-0 z-10" style={{ height: itemHeight, background: "linear-gradient(to top, rgb(23 23 23), transparent)" }} /><div ref={containerRef} onScroll={handleScroll} className="wheel-scroll overflow-y-scroll" style={{ height: itemHeight * visible, scrollSnapType: "y mandatory", paddingTop: itemHeight, paddingBottom: itemHeight }}>{items.map((it, idx) => (<div key={it} onClick={() => { containerRef.current?.scrollTo({ top: idx * itemHeight, behavior: "smooth" }); onChange(items[idx]); }} style={{ height: itemHeight, scrollSnapAlign: "center" }} className={flex cursor-pointer items-center justify-center text-sm transition-all ${it === value ? "font-bold text-amber-400" : "text-neutral-600"}}>{it}))});}function LoginScreen({ onLogin }) {const [selected, setSelected] = useState(APCS[0]);return (FrameGidiProduction OSScroll to select APC<button onClick={() => onLogin("apc", selected)} className="mt-3 w-full rounded-md bg-amber-500 py-3 font-semibold text-neutral-950 active:bg-amber-400">Log in as {selected}<button onClick={() => onLogin("management")} className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 py-2.5 text-sm text-neutral-300">Management / QD<button onClick={() => onLogin("hr")} className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 py-2.5 text-sm text-neutral-300">HR / Ghiazat);}function TopBar({ role, apcName, loading, lastSynced, onRefresh, onLogout }) {const label = role === "apc" ? APC · ${apcName} : role === "management" ? "Management / QD" : "HR / Ghiazat";const Icon = role === "apc" ? User : Lock;return (<Icon size={16} className={role === "apc" ? "text-amber-500" : "text-neutral-500"} />{label}{role !== "apc" && read-only}<RefreshCw size={16} className={loading ? "animate-spin" : ""} />switch{lastSynced ? Synced ${elapsed(lastSynced)} ago : "Syncing…"});}function SearchBar({ value, onChange }) {return (<input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search client, job ID, size…" className="input pl-9" />);}function FilterBar({ filter, setFilter }) {const opts = ["All", "High Priority", "Express", "TBR", "IN", "ER", "Waiting for Image", "Delayed", "Water Taping", "Ready for Fulfillment", "Fulfillment", "Completed"];return ({opts.map((o) => (<button key={o} onClick={() => setFilter(o)} className={shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${filter === o ? "bg-amber-500 text-neutral-950" : "bg-neutral-900 text-neutral-400 border border-neutral-800"}}>{o}))});}function ModuleAccordion({ activeModule, setActiveModule }) {const modules = [["production", "Production OS"], ["tracking", "Job Tracking"], ["installation", "Installation"]];return ({modules.map(([key, label]) => (<button key={key} onClick={() => setActiveModule(key)} className={flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-semibold ${activeModule === key ? "border-amber-500 bg-amber-500/10 text-amber-400" : "border-neutral-800 bg-neutral-900 text-neutral-400"}}>{label}<ChevronRight size={14} className={transition-transform ${activeModule === key ? "rotate-90" : ""}} />))});}function NavTabs({ tab, setTab }) {const tabs = [["dashboard", "Dashboard"], ["jobs", "Jobs"], ["rework", "Rework"], ["handover", "Handover"], ["inventory", "Inventory"]];return ({tabs.map(([key, label]) => (<button key={key} onClick={() => setTab(key)} className={shrink-0 rounded-md px-4 py-2 text-xs font-semibold ${tab === key ? "bg-amber-500 text-neutral-950" : "text-neutral-400"}}>{label}))});}function AttentionList({ jobs, now, onOpenJobs }) {const urgent = jobs.filter((j) =>j.status !== "COMPLETED" &&(j.priority === "express" || j.delayed?.active || j.imageStatus === "WAITING" ||j.fulfillment.status === "WATER_TAPING" || j.status === "READY_FOR_FULFILLMENT" || j.status === "IN_FULFILLMENT"));return (Needs attention ({urgent.length})open jobs{urgent.length === 0 && }{urgent.slice(0, 8).map((job) => ({job.clientName}{job.priority === "express" && Express · {elapsed(job.expressStartedAt, now)}}{job.delayed?.active && Delayed}{job.imageStatus === "WAITING" && Waiting image}{job.status === "READY_FOR_FULFILLMENT" && Ready for fulfillment}))});}function PriorityAndDelaySections({ jobs, now }) {const priorityJobs = jobs.filter((j) => j.status !== "COMPLETED" && (j.priority === "express" || j.priority === "high"));const delayedJobs = jobs.filter((j) => j.delayed?.active);return (Current Priorities{priorityJobs.length === 0 && }{priorityJobs.map((j) => ({j.clientName} {j.jobRef}{j.priority === "express" && Express · {elapsed(j.expressStartedAt, now)}}))}Current Delays{delayedJobs.length === 0 && }{delayedJobs.map((j) => ({j.clientName}{j.delayed.reason}))});}function LatestHandoverNote() {const [latest, setLatest] = useState(null);useEffect(() => {async function load() {const keys = await listKeys("handover:");const results = await Promise.all(keys.map(safeGet));const sorted = results.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);setLatest(sorted[0] || null);}load();const t = setInterval(load, POLL_MS);return () => clearInterval(t);}, []);return (Handover{latest?.notes ? ({latest.notes}— {latest.apc}, {elapsed(latest.createdAt)} ago) : No handover notes yet.});}function ActivityLog() {const [entries, setEntries] = useState([]);const load = useCallback(async () => {const keys = await listKeys("activity:");const results = await Promise.all(keys.map(safeGet));setEntries(results.filter(Boolean).sort((a, b) => b.timestamp - a.timestamp).slice(0, 10));}, []);useEffect(() => { load(); const t = setInterval(load, POLL_MS); return () => clearInterval(t); }, [load]);return (Recent Activity{entries.length === 0 && }{entries.map((e, i) => ({e.action} — {e.jobRef} · {e.person} · {elapsed(e.timestamp)} ago))});}// ---------------- DYNAMIC OPERATIONAL SELECTORS ----------------function JobSelector({ jobs, selectedId, onSelect }) {const [query, setQuery] = useState("");const selected = jobs.find((j) => j.id === selectedId);const matches = query.trim() ? jobs.filter((j) => j.clientName.toLowerCase().includes(query.toLowerCase()) || j.jobRef.toLowerCase().includes(query.toLowerCase())) : jobs.slice(0, 8);if (selected) {return ({selected.clientName} {selected.jobRef}<button onClick={() => onSelect(null)} className="text-xs text-neutral-500 underline">change);}return (<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search client or job reference…" className="input mb-2" />{matches.length === 0 && No jobs found.}{matches.map((j) => (<button key={j.id} onClick={() => onSelect(j.id)} className="block w-full rounded-md border border-neutral-800 bg-neutral-900 p-2 text-left text-sm">{j.clientName} {j.jobRef}))});}function JobInfoCard({ job }) {const types = getJobTypes(job);const typeLabels = [types.framed && "Framed", types.canvas && "Canvas", types.tbr && "TBR"].filter(Boolean).join(" + ");return ({job.clientName} {job.jobRef}{typeLabels || "—"} · Total {job.quantity} pcs);}// ---------------- UNIFIED TRACKING MODULES ----------------function JobTrackingModule({ jobs, apcName, cutRecords, coupleRecords, onCreateCut, onCreateCouple, editable }) {const [selectedId, setSelectedId] = useState(null);const job = jobs.find((j) => j.id === selectedId);return (Job Tracking{!job && }{job && ({editable && }{editable && })});}function CuttingForm({ job, apcName, onCreate }) {const [expanded, setExpanded] = useState(false);const [material, setMaterial] = useState(TRACK_MATERIALS[0]);const [size, setSize] = useState("");const [qty, setQty] = useState(1);const [cutBy, setCutBy] = useState("");const [notes, setNotes] = useState("");return (<button onClick={() => setExpanded((e) => !e)} className="flex w-full items-center justify-between text-xs font-bold uppercase tracking-wide text-amber-500">Cutting <ChevronRight size={13} className={expanded ? "rotate-90" : ""} />{expanded && (<input value={size} onChange={(e) => setSize(e.target.value)} placeholder="Size" className="input" /><input value={cutBy} onChange={(e) => setCutBy(e.target.value)} placeholder="Cut by — worker name" className="input" /><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" className="input" /><button onClick={() => { if(cutBy.trim()) { onCreate({ id: newId("cut"), jobId: job.id, jobRef: job.jobRef || job.clientName, clientName: job.clientName, material, size: size.trim(), qty, cutBy: cutBy.trim(), notes: notes.trim(), recordedBy: apcName, createdAt: Date.now() }); setSize(""); setQty(1); setCutBy(""); setNotes(""); setExpanded(false); } }} disabled={!cutBy.trim()} className="w-full rounded-md bg-amber-500 py-2 text-xs font-semibold text-neutral-950 disabled:opacity-40">Save Cutting Record)});}
