import { createContext, useContext, useState, useCallback, useMemo } from 'react';

/**
 * Phase 7 — minimal client-side cart state for the bracketing demo.
 *
 * No cart backend exists. The /api/prevention/checkout-risk endpoint is
 * cart-agnostic — it scores whatever items[] you pass. This context just
 * holds the current cart in memory so the BracketingNudge has something to
 * detect and act on.
 *
 * Shape: cart = [{ productId, quantity, sizeSelected? }]
 */

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState([]);

  const addToCart = useCallback((productId, qty = 1, sizeSelected = null) => {
    setCart((prev) => {
      const existing = prev.find(
        (i) => i.productId === productId && i.sizeSelected === sizeSelected
      );
      if (existing) {
        return prev.map((i) =>
          i.productId === productId && i.sizeSelected === sizeSelected
            ? { ...i, quantity: i.quantity + qty }
            : i
        );
      }
      return [...prev, { productId, quantity: qty, sizeSelected }];
    });
  }, []);

  const removeFromCart = useCallback((productId, sizeSelected = null) => {
    setCart((prev) =>
      prev.filter(
        (i) => !(i.productId === productId && i.sizeSelected === sizeSelected)
      )
    );
  }, []);

  const setQuantity = useCallback((productId, quantity, sizeSelected = null) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.productId === productId && i.sizeSelected === sizeSelected
            ? { ...i, quantity: Math.max(0, quantity) }
            : i
        )
        .filter((i) => i.quantity > 0)
    );
  }, []);

  /** Drop all duplicates of a productId (used by the bracketing "remove extras" CTA). */
  const keepOneOf = useCallback((productId) => {
    setCart((prev) => {
      const matching = prev.filter((i) => i.productId === productId);
      if (matching.length === 0) return prev;
      const others = prev.filter((i) => i.productId !== productId);
      return [...others, { ...matching[0], quantity: 1 }];
    });
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const value = useMemo(
    () => ({
      cart,
      addToCart,
      removeFromCart,
      setQuantity,
      keepOneOf,
      clearCart,
    }),
    [cart, addToCart, removeFromCart, setQuantity, keepOneOf, clearCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    // Soft fallback so a component using `useCart()` outside the provider
    // doesn't crash — it just operates on an empty cart.
    return {
      cart: [],
      addToCart: () => {},
      removeFromCart: () => {},
      setQuantity: () => {},
      keepOneOf: () => {},
      clearCart: () => {},
    };
  }
  return ctx;
}
