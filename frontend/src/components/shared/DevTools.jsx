import { useState } from 'react';
import { useCustomUser } from '../../context/CustomUserContext';
import { Terminal, Shield, User, ShoppingBag, LogOut, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function DevTools() {
  const isDev = process.env.NODE_ENV !== 'production' || import.meta.env?.DEV;
  if (!isDev) return null;

  const { isSignedIn, mongoUser, role } = useCustomUser();
  const [isOpen, setIsOpen] = useState(false);
  const [customId, setCustomId] = useState('');

  const handleMockLogin = (id) => {
    localStorage.setItem('mock_clerk_id', id);
    window.location.reload();
  };

  const handleClearMock = () => {
    localStorage.removeItem('mock_clerk_id');
    window.location.reload();
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999] font-sans">
      {/* Floating Action Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-black px-4 py-2.5 rounded-full shadow-2xl font-semibold text-xs border border-amber-400 cursor-pointer"
      >
        <Terminal className="w-4 h-4" />
        <span>Dev Bypass</span>
      </motion.button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="absolute bottom-14 right-0 w-80 bg-zinc-950/95 backdrop-blur-md border border-zinc-800 rounded-3xl p-5 shadow-2xl text-white space-y-4"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-amber-500 animate-spin-slow" />
                <h3 className="font-bold text-sm">Developer Bypass Portal</h3>
              </div>
              <button 
                onClick={() => setIsOpen(false)}
                className="text-zinc-500 hover:text-white text-xs cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Current Status */}
            <div className="bg-zinc-900/50 border border-zinc-800/80 rounded-2xl p-3 text-xs space-y-1.5">
              <span className="text-zinc-500 block">Current Auth Mode:</span>
              {localStorage.getItem('mock_clerk_id') ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-emerald-400">Mock Bypass Enabled</span>
                  </div>
                  <span className="text-zinc-300">User: {mongoUser?.firstName} ({mongoUser?.email})</span>
                  <span className="text-zinc-300">Role: <span className="capitalize font-medium text-amber-400">{role}</span></span>
                </div>
              ) : isSignedIn ? (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-blue-400 font-medium">Clerk Production Auth</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-zinc-600" />
                  <span className="text-zinc-400 font-medium">Signed Out</span>
                </div>
              )}
            </div>

            {/* Quick Login Roles */}
            <div className="space-y-2">
              <span className="text-[11px] text-zinc-500 font-medium tracking-wider uppercase block">Quick Role Login</span>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleMockLogin('mock_admin')}
                  className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 p-2.5 rounded-xl text-xs font-medium transition-all text-amber-400 cursor-pointer"
                >
                  <Shield className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </button>
                <button
                  onClick={() => handleMockLogin('mock_seller')}
                  className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 p-2.5 rounded-xl text-xs font-medium transition-all text-sky-400 cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>Seller</span>
                </button>
                <button
                  onClick={() => handleMockLogin('mock_brand')}
                  className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 p-2.5 rounded-xl text-xs font-medium transition-all text-purple-400 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Brand</span>
                </button>
                <button
                  onClick={() => handleMockLogin('mock_buyer')}
                  className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 p-2.5 rounded-xl text-xs font-medium transition-all text-zinc-300 cursor-pointer"
                >
                  <User className="w-3.5 h-3.5" />
                  <span>Buyer</span>
                </button>
              </div>
            </div>

            {/* Custom Mock ID */}
            <div className="space-y-1.5">
              <span className="text-[11px] text-zinc-500 font-medium tracking-wider uppercase block">Custom Mock ID</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. mock_john"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                />
                <button
                  onClick={() => {
                    if (customId.trim()) {
                      const id = customId.trim().startsWith('mock_') ? customId.trim() : `mock_${customId.trim()}`;
                      handleMockLogin(id);
                    }
                  }}
                  className="bg-amber-500 hover:bg-amber-600 text-black px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Go
                </button>
              </div>
            </div>

            {/* Clear Bypass */}
            {localStorage.getItem('mock_clerk_id') && (
              <button
                onClick={handleClearMock}
                className="w-full flex items-center justify-center gap-1.5 bg-red-950/40 hover:bg-red-900/30 border border-red-900/40 hover:border-red-900/60 p-2.5 rounded-xl text-xs font-semibold text-red-300 transition-all cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disable Developer Bypass</span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
