import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle2, Loader2, ImagePlus, ArrowRight, AlertTriangle, Sparkles,
} from 'lucide-react';
import {
  uploadToS3, getItemStatus, getEvidenceForm, validateEvidencePhoto,
} from '../services/item.service';
import { submitReturnEvidence } from '../services/return.service';
import { submitSecondhandEvidence } from '../services/secondhand.service';
import DeveloperLogsSidebar from '../components/shared/DeveloperLogsSidebar';
import TrustTierBadge from '../components/shared/TrustTierBadge';

const FORM_POLL_INTERVAL = 1500;

/**
 * ItemEvidencePage (v3.44)
 *
 * Renders the DYNAMIC, product- & claim-specific Pass-1 form. While Pass 1 runs
 * the user sees the generic fields instantly; the AI-tailored schema swaps in when
 * ready (no spinner). Each photo field uploads to S3 and is validated against its
 * `expected_subject` (right part? in focus?). On submit we send a field→image
 * mapping so Pass 2 can grade by named field.
 */
export default function ItemEvidencePage() {
  const { itemId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const intakePath = location.state?.intakePath || 'return';
  const productTitle = location.state?.productTitle || 'Your item';

  const [trustTier, setTrustTier] = useState(null);
  const [schema, setSchema] = useState(null);
  const [readiness, setReadiness] = useState('pending'); // pending | ready | fallback
  const [source, setSource] = useState(null);

  // Per-field state: { [fieldId]: { photos: [{url, status, issues}], text } }
  const [fieldState, setFieldState] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const fileInputs = useRef({});

  // --- Load trust tier once ---
  useEffect(() => {
    if (!itemId) return;
    getItemStatus(itemId)
      .then((res) => { if (res.success) setTrustTier(res.data.trustTier); })
      .catch(() => {});
  }, [itemId]);

  // --- Poll the dynamic form until ready/fallback ---
  useEffect(() => {
    if (!itemId) return undefined;
    let active = true;
    const poll = async () => {
      try {
        const res = await getEvidenceForm(itemId);
        if (!active || !res.success) return;
        setSchema(res.data.schema);
        setReadiness(res.data.readiness);
        setSource(res.data.source || null);
      } catch {
        /* keep last schema on transient failure */
      }
    };
    poll();
    const interval = setInterval(() => {
      // Stop polling once the AI form (or fallback) has arrived.
      if (readiness === 'ready' || readiness === 'fallback') return;
      poll();
    }, FORM_POLL_INTERVAL);
    return () => { active = false; clearInterval(interval); };
  }, [itemId, readiness]);

  const photoFields = (schema?.fields || []).filter((f) => f.type === 'photo');
  const textFields = (schema?.fields || []).filter((f) => f.type !== 'photo');

  // --- Upload + validate a photo for a specific field ---
  const handleFieldUpload = useCallback(async (field, files) => {
    const valid = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!valid.length) return;
    setError(null);

    for (const file of valid) {
      const tmpUrl = URL.createObjectURL(file);
      // Optimistic uploading entry.
      setFieldState((prev) => ({
        ...prev,
        [field.id]: {
          ...(prev[field.id] || {}),
          photos: [...((prev[field.id] || {}).photos || []), { tmpUrl, status: 'uploading', issues: [] }],
        },
      }));

      try {
        const url = await uploadToS3(file, itemId);
        // Run inline validation against the field's expected subject.
        let issues = [];
        setFieldState((prev) => updatePhoto(prev, field.id, tmpUrl, { url, status: 'validating' }));
        try {
          const res = await validateEvidencePhoto({
            photoUrl: url, itemId, expectedSubject: field.expected_subject,
          });
          issues = res?.data?.issues || [];
        } catch {
          /* validation outage — accept the photo */
        }
        setFieldState((prev) => updatePhoto(prev, field.id, tmpUrl, {
          url, status: issues.length ? 'warning' : 'ok', issues,
        }));
      } catch (err) {
        setFieldState((prev) => updatePhoto(prev, field.id, tmpUrl, {
          status: 'error', issues: ['upload_failed'],
        }));
        setError('A photo failed to upload. Please try again.');
      }
    }
  }, [itemId]);

  const removePhoto = (fieldId, tmpUrl) => {
    setFieldState((prev) => {
      const f = prev[fieldId] || {};
      return {
        ...prev,
        [fieldId]: { ...f, photos: (f.photos || []).filter((p) => p.tmpUrl !== tmpUrl) },
      };
    });
  };

  const setText = (fieldId, value) => {
    setFieldState((prev) => ({ ...prev, [fieldId]: { ...(prev[fieldId] || {}), text: value } }));
  };

  // --- Required-field gating (client-side mirror of the backend gate) ---
  const missingRequired = photoFields
    .filter((f) => f.required)
    .filter((f) => !((fieldState[f.id]?.photos || []).some((p) => p.url)))
    .map((f) => f.label || f.id);

  const buildFieldImages = () => {
    const map = {};
    for (const f of photoFields) {
      const urls = (fieldState[f.id]?.photos || []).filter((p) => p.url).map((p) => p.url);
      if (urls.length) map[f.id] = urls;
    }
    return map;
  };

  const handleSubmit = async () => {
    if (missingRequired.length) {
      setError(`Please add: ${missingRequired.join(', ')}`);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const fieldImages = buildFieldImages();
      const allUrls = Object.values(fieldImages).flat();
      if (allUrls.length === 0) {
        setError('Upload at least one photo before submitting.');
        setSubmitting(false);
        return;
      }
      const submitFn = intakePath === 'sell-used' ? submitSecondhandEvidence : submitReturnEvidence;
      await submitFn(itemId, allUrls, fieldImages);
      navigate(`/items/${itemId}/status`, { state: { intakePath, productTitle }, replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const label = intakePath === 'sell-used' ? 'Sell Used' : 'Return';
  const isAiForm = readiness === 'ready' && source && source !== 'last_resort';

  return (
    <div className="flex">
      <div className="flex-1 min-w-0">
        <div className="max-w-2xl mx-auto px-4 py-10 font-sans">
          {/* Header */}
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
              <span className="uppercase tracking-widest font-semibold text-[#FF9900]">{label}</span>
              <span>/</span>
              <span>Evidence</span>
            </div>
            <h1 className="text-2xl font-black text-gray-900 leading-tight">
              {schema?.title || 'Item Condition Evidence'} — <span className="text-[#FF9900]">{productTitle}</span>
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {isAiForm
                ? 'We tailored this checklist to your item and your reason. Add each photo below.'
                : 'Add clear, well-lit photos showing the item\u2019s current condition.'}
            </p>
            <div className="flex items-center gap-2 mt-3">
              {trustTier && <TrustTierBadge tier={trustTier} />}
              {/* Form readiness indicator (progressive form) */}
              {readiness === 'pending' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-600">
                  <Loader2 className="w-3 h-3 animate-spin" /> Tailoring your form…
                </span>
              )}
              {isAiForm && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-600">
                  <Sparkles className="w-3 h-3" /> AI-tailored checklist
                </span>
              )}
              {readiness === 'fallback' && (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded bg-amber-50 text-amber-600">
                  <AlertTriangle className="w-3 h-3" /> Standard checklist
                </span>
              )}
            </div>
          </motion.div>

          {/* Photo fields */}
          <div className="space-y-4">
            {photoFields.map((field) => {
              const photos = fieldState[field.id]?.photos || [];
              return (
                <motion.div
                  key={field.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="border border-gray-200 rounded-2xl p-4 bg-white"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-gray-800 text-sm">
                        {field.label}
                        {field.required && <span className="text-red-500 ml-1">*</span>}
                      </p>
                      {field.guidance && <p className="text-xs text-gray-500 mt-0.5">{field.guidance}</p>}
                      {field.expected_subject && (
                        <p className="text-[11px] text-gray-400 mt-0.5 italic">Should show: {field.expected_subject}</p>
                      )}
                    </div>
                    <button
                      onClick={() => fileInputs.current[field.id]?.click()}
                      className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[#FF9900] hover:text-[#FFB347] px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50"
                    >
                      <ImagePlus className="w-4 h-4" /> Add
                    </button>
                    <input
                      ref={(el) => { fileInputs.current[field.id] = el; }}
                      type="file" accept="image/*" multiple className="hidden"
                      onChange={(e) => handleFieldUpload(field, e.target.files)}
                    />
                  </div>

                  {photos.length > 0 && (
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {photos.map((p) => (
                        <div key={p.tmpUrl} className="relative rounded-xl overflow-hidden aspect-square group border border-gray-200">
                          <img src={p.url || p.tmpUrl} alt="" className="w-full h-full object-cover" />
                          {/* status overlay */}
                          <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-[9px] font-semibold flex items-center gap-1">
                            {p.status === 'uploading' && <span className="text-white bg-black/60 rounded px-1 inline-flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" /> Uploading</span>}
                            {p.status === 'validating' && <span className="text-white bg-black/60 rounded px-1 inline-flex items-center gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" /> Checking</span>}
                            {p.status === 'ok' && <span className="text-white bg-emerald-500/80 rounded px-1 inline-flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> Looks good</span>}
                            {p.status === 'warning' && <span className="text-white bg-amber-500/90 rounded px-1 inline-flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5" /> {humanizeIssues(p.issues)}</span>}
                            {p.status === 'error' && <span className="text-white bg-red-500/90 rounded px-1">Upload failed</span>}
                          </div>
                          <button
                            onClick={() => removePhoto(field.id, p.tmpUrl)}
                            className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}

            {/* Text / notes fields */}
            {textFields.map((field) => (
              <div key={field.id} className="border border-gray-200 rounded-2xl p-4 bg-white">
                <label className="font-bold text-gray-800 text-sm block">
                  {field.label}{field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {field.guidance && <p className="text-xs text-gray-500 mt-0.5 mb-2">{field.guidance}</p>}
                <textarea
                  rows={3}
                  value={fieldState[field.id]?.text || ''}
                  onChange={(e) => setText(field.id, e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#FF9900]"
                  placeholder="Type here…"
                />
              </div>
            ))}
          </div>

          {/* Tips */}
          {schema?.photo_guidance?.length > 0 && (
            <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4">
              <p className="text-xs font-semibold text-blue-700 mb-2">📸 Photo tips</p>
              <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
                {schema.photo_guidance.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </div>
          )}

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <div className="mt-6 flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {missingRequired.length
                ? `${missingRequired.length} required item(s) left`
                : 'All required photos added'}
            </p>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleSubmit}
              disabled={submitting || missingRequired.length > 0}
              className="inline-flex items-center gap-2 bg-[#FF9900] hover:bg-[#FFB347] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm text-sm"
            >
              {submitting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</>)
                : (<>Submit Evidence <ArrowRight className="w-4 h-4" /></>)}
            </motion.button>
          </div>
        </div>
      </div>

      <DeveloperLogsSidebar itemId={itemId} />
    </div>
  );
}

// --- helpers ---------------------------------------------------------------
function updatePhoto(state, fieldId, tmpUrl, patch) {
  const f = state[fieldId] || {};
  return {
    ...state,
    [fieldId]: {
      ...f,
      photos: (f.photos || []).map((p) => (p.tmpUrl === tmpUrl ? { ...p, ...patch } : p)),
    },
  };
}

function humanizeIssues(issues = []) {
  const map = {
    too_blurry: 'Too blurry',
    blurry: 'Too blurry',
    too_dark: 'Too dark',
    dark: 'Too dark',
    too_bright: 'Too bright',
    too_low_res: 'Low resolution',
    wrong_subject: 'Wrong subject',
    moire: 'Photo of a screen?',
    unprocessable_image: 'Unreadable image',
    upload_failed: 'Upload failed',
  };
  return issues.map((i) => map[i] || i).join(', ');
}
