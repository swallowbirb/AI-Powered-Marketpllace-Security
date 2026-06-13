import { useState, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, CheckCircle2, Loader2, ImagePlus, ArrowRight } from 'lucide-react';
import { uploadToS3, getPresignedUrl } from '../services/item.service';
import { submitReturnEvidence } from '../services/return.service';
import { submitSecondhandEvidence } from '../services/secondhand.service';

// TODO: Phase 2 — replace this section with the dynamic Pass-1 form schema received from Bedrock

export default function ItemEvidencePage() {
  const { itemId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const intakePath = location.state?.intakePath || 'return';
  const productTitle = location.state?.productTitle || 'Your item';

  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState(null);

  const addFiles = useCallback((incoming) => {
    const valid = Array.from(incoming).filter((f) => f.type.startsWith('image/'));
    if (!valid.length) return;
    setFiles((prev) => [...prev, ...valid]);
    setPreviews((prev) => [
      ...prev,
      ...valid.map((f) => ({ url: URL.createObjectURL(f), name: f.name })),
    ]);
  }, []);

  const removeFile = (idx) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      setError('Upload at least one photo before submitting.');
      return;
    }
    setError(null);
    setUploading(true);

    try {
      const urls = await Promise.all(files.map((f) => uploadToS3(f, itemId)));

      const submitFn = intakePath === 'sell-used' ? submitSecondhandEvidence : submitReturnEvidence;
      await submitFn(itemId, urls);

      navigate(`/items/${itemId}/status`, {
        state: { intakePath, productTitle },
        replace: true,
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const label = intakePath === 'sell-used' ? 'Sell Used' : 'Return';

  return (
    <div className="max-w-2xl mx-auto px-4 py-10 font-sans">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-3">
          <span className="uppercase tracking-widest font-semibold text-[#FF9900]">{label}</span>
          <span>/</span>
          <span>Evidence</span>
        </div>
        <h1 className="text-2xl font-black text-gray-900 leading-tight">
          Add photos of <span className="text-[#FF9900]">{productTitle}</span>
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload clear, well-lit photos showing the item's current condition. Minimum 1 photo required.
        </p>
      </motion.div>

      {/* Drop zone */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 cursor-pointer
          ${isDragging ? 'border-[#FF9900] bg-orange-50' : 'border-gray-200 bg-gray-50 hover:border-gray-400 hover:bg-white'}`}
        onClick={() => document.getElementById('file-input').click()}
      >
        <input
          id="file-input"
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-colors
            ${isDragging ? 'bg-[#FF9900]/20 text-[#FF9900]' : 'bg-white border border-gray-200 text-gray-400'}`}>
            <ImagePlus className="w-7 h-7" />
          </div>
          <div>
            <p className="font-semibold text-gray-800 text-sm">
              {isDragging ? 'Drop photos here' : 'Drag & drop or click to upload'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">JPG, PNG, WEBP — multiple allowed</p>
          </div>
        </div>
      </motion.div>

      {/* Photo previews */}
      <AnimatePresence>
        {previews.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-5 grid grid-cols-3 gap-3"
          >
            {previews.map((p, i) => (
              <motion.div
                key={p.url}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="relative rounded-xl overflow-hidden aspect-square group border border-gray-200 shadow-sm"
              >
                <img src={p.url} alt={p.name} className="w-full h-full object-cover" />
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                  className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            ))}
            {/* Add more button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => document.getElementById('file-input').click()}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center cursor-pointer hover:border-gray-400 transition-colors"
            >
              <Upload className="w-5 h-5 text-gray-300" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tips */}
      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-700 mb-2">📸 Photo tips for faster approval</p>
        <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
          <li>Good lighting — natural light works best</li>
          <li>Show all sides including any damage</li>
          <li>Include a close-up of any defects</li>
          <li>Avoid blurry or dark photos</li>
        </ul>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {files.length > 0 ? `${files.length} photo${files.length > 1 ? 's' : ''} selected` : 'No photos yet'}
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSubmit}
          disabled={uploading || files.length === 0}
          className="inline-flex items-center gap-2 bg-[#FF9900] hover:bg-[#FFB347] disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-6 py-2.5 rounded-xl transition-colors shadow-sm text-sm"
        >
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Uploading…</>
          ) : (
            <>Submit Evidence <ArrowRight className="w-4 h-4" /></>
          )}
        </motion.button>
      </div>
    </div>
  );
}
