import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { createProduct } from '../services/product.service';
import { ArrowLeft, Upload, Loader2 } from 'lucide-react';

const NewProductPage = () => {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    price: '',
    category: '',
    brandName: '',
    images: [''],
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageChange = (idx, val) => {
    setFormData(prev => {
      const images = [...prev.images];
      images[idx] = val;
      return { ...prev, images };
    });
  };

  const addImageField = () => {
    setFormData(prev => ({ ...prev, images: [...prev.images, ''] }));
  };

  const removeImageField = (idx) => {
    setFormData(prev => ({ ...prev, images: prev.images.filter((_, i) => i !== idx) }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    // Basic client validation
    if (!formData.title || !formData.description || formData.price === '' || !formData.category) {
      setError('All fields are required.');
      setIsSubmitting(false);
      return;
    }

    if (isNaN(Number(formData.price)) || Number(formData.price) < 0) {
      setError('Price must be a valid positive number.');
      setIsSubmitting(false);
      return;
    }

    try {
      const images = formData.images.filter(url => url.trim() !== '');
      const response = await createProduct({
        ...formData,
        price: Number(formData.price),
        images,
      });

      if (response.success) {
        navigate('/seller/dashboard');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to create product. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-8 font-sans flex justify-center items-center">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden"
      >
        {/* Decorative background glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[150%] h-[150px] bg-blue-500/10 blur-[100px] rounded-[100%] pointer-events-none" />

        <button 
          onClick={() => navigate('/seller/dashboard')}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-8 relative z-10"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="mb-10 relative z-10">
          <h1 className="text-4xl font-bold tracking-tight mb-2">Create New Listing</h1>
          <p className="text-zinc-400">Fill in the details below to add a new product to your store.</p>
        </div>

        {error && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl text-sm"
          >
            {error}
          </motion.div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-zinc-300 mb-2">
              Product Title
            </label>
            <input
              type="text"
              id="title"
              name="title"
              value={formData.title}
              onChange={handleChange}
              placeholder="e.g. Premium Wireless Headphones"
              className="w-full bg-black/50 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
            />
          </div>

          <div>
            <label htmlFor="price" className="block text-sm font-medium text-zinc-300 mb-2">
              Price ($)
            </label>
            <input
              type="number"
              id="price"
              name="price"
              step="0.01"
              value={formData.price}
              onChange={handleChange}
              placeholder="0.00"
              className="w-full bg-black/50 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
            />
          </div>

          <div>
            <label htmlFor="category" className="block text-sm font-medium text-zinc-300 mb-2">
              Category
            </label>
            <select
              id="category"
              name="category"
              value={formData.category}
              onChange={handleChange}
              className="w-full bg-black/50 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
            >
              <option value="">Select a category...</option>
              <option value="Electronics">Electronics</option>
              <option value="Clothing">Clothing</option>
              <option value="Home & Garden">Home &amp; Garden</option>
              <option value="Sports">Sports</option>
              <option value="Toys">Toys</option>
              <option value="Books">Books</option>
              <option value="Automotive">Automotive</option>
              <option value="Health & Beauty">Health &amp; Beauty</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="brandName" className="block text-sm font-medium text-zinc-300 mb-2">
              Brand Name <span className="text-zinc-500">(optional)</span>
            </label>
            <input
              type="text"
              id="brandName"
              name="brandName"
              value={formData.brandName}
              onChange={handleChange}
              placeholder="e.g. Nike, Apple, Samsung"
              className="w-full bg-black/50 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
            />
            <p className="text-xs text-zinc-600 mt-1">
              Type any brand name freely. The AI will cross-reference this against registered brands.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-zinc-300">
                Product Images <span className="text-zinc-500">(optional URLs)</span>
              </label>
              <button
                type="button"
                onClick={addImageField}
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                + Add another
              </button>
            </div>
            {formData.images.map((url, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input
                  type="url"
                  value={url}
                  onChange={(e) => handleImageChange(idx, e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="flex-1 bg-black/50 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-sm"
                />
                {formData.images.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeImageField(idx)}
                    className="text-zinc-500 hover:text-red-400 transition-colors px-2"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-zinc-300 mb-2">
              Description
            </label>
            <textarea
              id="description"
              name="description"
              rows={4}
              value={formData.description}
              onChange={handleChange}
              placeholder="Describe your product in detail..."
              className="w-full bg-black/50 border border-zinc-800 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all resize-none"
            />
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-4 rounded-xl hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(255,255,255,0.1)] hover:shadow-[0_0_30px_rgba(255,255,255,0.2)]"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating Listing...
                </>
              ) : (
                <>
                  <Upload className="w-5 h-5" />
                  Publish Product
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default NewProductPage;
