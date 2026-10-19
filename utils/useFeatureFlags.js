import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

const CACHE_KEY = 'featureFlags_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day in milliseconds

// Global state to prevent multiple simultaneous API calls
let globalFlagsPromise = null;
let globalFlagsCache = null;
let globalFlagsTimestamp = null;
let isFetching = false; // Synchronous lock to prevent race conditions

/**
 * Get cached flags from localStorage (synchronous)
 * Safe for SSR - returns null if localStorage is not available
 * @returns {Object|null} Cached flags or null if expired/missing
 */
const getCachedFlagsSync = () => {
  // Check if we're in browser environment (not SSR)
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
    return null;
  }

  try {
    // First check global cache
    if (globalFlagsCache && globalFlagsTimestamp) {
      const now = Date.now();
      if (now - globalFlagsTimestamp < CACHE_DURATION) {
        return globalFlagsCache;
      }
    }

    // Then check localStorage
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const { flags, timestamp } = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is still valid
    if (now - timestamp < CACHE_DURATION) {
      // Update global cache
      globalFlagsCache = flags;
      globalFlagsTimestamp = timestamp;
      return flags;
    }
    
    // Cache expired, remove it
    localStorage.removeItem(CACHE_KEY);
    globalFlagsCache = null;
    globalFlagsTimestamp = null;
    return null;
  } catch (error) {
    console.error('Error reading cached flags:', error);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CACHE_KEY);
    }
    globalFlagsCache = null;
    globalFlagsTimestamp = null;
    return null;
  }
};

/**
 * Custom hook to fetch and check feature flags with localStorage caching
 * @returns {Object} { featureFlags, loading, checkFeature, refreshFlags }
 */
export const useFeatureFlags = () => {
  // Track if we initialized from cache
  const initializedFromCache = useRef(false);
  // Track if we've already run the initialization effect (prevents re-running on re-renders)
  const hasInitialized = useRef(false);
  
  // Initialize state from cache synchronously (lazy initializer ensures it only runs once)
  const [featureFlags, setFeatureFlags] = useState(() => {
    const cached = getCachedFlagsSync();
    if (cached) {
      initializedFromCache.current = true;
    }
    return cached || {};
  });
  const [loading, setLoading] = useState(() => {
    const cached = getCachedFlagsSync();
    return !cached; // Only loading if no cache
  });

  /**
   * Save flags to localStorage and global cache
   * @param {Object} flags - Feature flags to cache
   */
  const setCachedFlags = useCallback((flags) => {
    // Only cache if we're in browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    try {
      const timestamp = Date.now();
      const cacheData = {
        flags,
        timestamp
      };
      localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
      // Update global cache
      globalFlagsCache = flags;
      globalFlagsTimestamp = timestamp;
    } catch (error) {
      console.error('Error caching flags:', error);
    }
  }, []);

  /**
   * Fetch flags from API (with global promise to prevent multiple calls)
   * @param {boolean} forceRefresh - If true, bypass cache
   */
  const fetchFlags = useCallback(async (forceRefresh = false) => {
    // Only fetch in browser environment
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      setFeatureFlags({});
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setFeatureFlags({});
        setLoading(false);
        return;
      }

      // CRITICAL: Check for existing promise FIRST (synchronously, before any other checks)
      // This prevents race conditions when multiple components mount simultaneously
      if (globalFlagsPromise && !forceRefresh) {
        try {
          const flags = await globalFlagsPromise;
          setFeatureFlags(flags);
          setLoading(false);
          return;
        } catch (err) {
          // If the shared promise fails, clear it and continue
          globalFlagsPromise = null;
          isFetching = false;
        }
      }

      // Try to use cached flags (unless force refresh)
      if (!forceRefresh) {
        const cachedFlags = getCachedFlagsSync();
        if (cachedFlags) {
          setFeatureFlags(cachedFlags);
          setLoading(false);
          return;
        }
      }

      // SYNCHRONOUS LOCK: Check if another component is already fetching
      // This prevents race conditions where multiple components check at the same time
      if (isFetching && !forceRefresh) {
        // Wait for the existing promise
        if (globalFlagsPromise) {
          try {
            const flags = await globalFlagsPromise;
            setFeatureFlags(flags);
            setLoading(false);
            return;
          } catch (err) {
            isFetching = false;
            globalFlagsPromise = null;
          }
        }
      }

      // Set lock synchronously BEFORE creating promise (prevents race conditions)
      if (!isFetching || forceRefresh) {
        isFetching = true;
        
        // Create the promise atomically
        globalFlagsPromise = (async () => {
          try {
            const { data } = await axios.get('/api/company/flags', {
              headers: { Authorization: `Bearer ${token}` }
            });
            
            const flags = data?.featureFlags || {};
            
            // Cache the flags
            setCachedFlags(flags);
            
            return flags;
          } catch (error) {
            console.error('Error fetching feature flags:', error);
            throw error;
          } finally {
            // Clear the lock and promise after a delay
            setTimeout(() => {
              isFetching = false;
              globalFlagsPromise = null;
            }, 1000);
          }
        })();
      }

      // Wait for the promise (either the one we just created or one that was created by another component)
      const flags = await globalFlagsPromise;
      setFeatureFlags(flags);
    } catch (error) {
      console.error('Error fetching feature flags:', error);
      setFeatureFlags({});
      // Clear promise and lock on error so retry can happen
      globalFlagsPromise = null;
      isFetching = false;
    } finally {
      setLoading(false);
    }
  }, [setCachedFlags]);

  useEffect(() => {
    // CRITICAL: Only run initialization once per component mount
    // This prevents re-fetching when component re-renders or when navigating between pages
    if (hasInitialized.current) {
      return;
    }

    // Mark as initialized immediately to prevent re-running
    hasInitialized.current = true;

    // ALWAYS check cache FIRST (synchronously) - this is the most important check
    // This ensures we use cache when navigating between pages/tabs
    // We check this BEFORE checking state, because state might not be set yet on first render
    const globalCache = getCachedFlagsSync();
    if (globalCache) {
      // Update state if we don't already have these flags or if they're different
      const needsUpdate = !featureFlags || 
                         Object.keys(featureFlags).length === 0 || 
                         JSON.stringify(featureFlags) !== JSON.stringify(globalCache);
      
      if (needsUpdate) {
        setFeatureFlags(globalCache);
        initializedFromCache.current = true;
      }
      setLoading(false);
      return; // CRITICAL: Return early - don't fetch if cache exists!
    }

    // If we already have flags in state (from cache initialization in useState), don't fetch
    // This is a secondary check in case cache check above didn't work for some reason
    if (featureFlags && Object.keys(featureFlags).length > 0 && initializedFromCache.current) {
      setLoading(false);
      return;
    }

    // Check if there's already a fetch in progress (synchronously check global promise)
    if (globalFlagsPromise) {
      // Wait for existing promise
      globalFlagsPromise
        .then((flags) => {
          setFeatureFlags(flags);
          initializedFromCache.current = true;
        })
        .catch(() => {
          // If promise fails, fetchFlags will handle retry
          fetchFlags();
        });
      return;
    }

    // Only fetch if no cache, no flags in state, and no pending promise
    if (!featureFlags || Object.keys(featureFlags).length === 0) {
      fetchFlags();
    }
    
    // Listen for custom events to refresh flags
    const handleCustomEvent = () => {
      globalFlagsPromise = null; // Clear any pending promise
      isFetching = false; // Clear lock
      fetchFlags(true); // Force refresh on custom event
    };
    
    // Listen for login event to refresh flags
    const handleLogin = () => {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(CACHE_KEY); // Clear cache on login
      }
      globalFlagsCache = null; // Clear global cache
      globalFlagsTimestamp = null;
      globalFlagsPromise = null; // Clear any pending promise
      isFetching = false; // Clear lock
      initializedFromCache.current = false; // Reset for this component
      fetchFlags(true);
    };
    
    window.addEventListener('featureFlagsRefresh', handleCustomEvent);
    window.addEventListener('userLoggedIn', handleLogin);
    
    return () => {
      window.removeEventListener('featureFlagsRefresh', handleCustomEvent);
      window.removeEventListener('userLoggedIn', handleLogin);
    };
  }, [fetchFlags]);

  /**
   * Check if a feature flag is enabled
   * @param {string} flagName - Name of the feature flag (e.g., 'isExtractSKU')
   * @returns {boolean} - True if feature is enabled, false otherwise
   */
  const checkFeature = useCallback((flagName) => {
    try {
      if (!featureFlags || !flagName) return false;
      return Boolean(featureFlags[flagName]);
    } catch (error) {
      console.error('Error checking feature flag:', error);
      return false;
    }
  }, [featureFlags]);

  /**
   * Force refresh flags from API (bypasses cache)
   */
  const refreshFlags = useCallback(() => {
    setLoading(true);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CACHE_KEY); // Clear cache
    }
    globalFlagsCache = null; // Clear global cache
    globalFlagsTimestamp = null;
    globalFlagsPromise = null; // Clear any pending promise
    isFetching = false; // Clear lock
    fetchFlags(true); // Force refresh
  }, [fetchFlags]);

  /**
   * Clear flags cache (useful on logout)
   */
  const clearCache = useCallback(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(CACHE_KEY);
    }
    globalFlagsCache = null; // Clear global cache
    globalFlagsTimestamp = null;
    globalFlagsPromise = null; // Clear any pending promise
    isFetching = false; // Clear lock
    setFeatureFlags({});
  }, []);

  return { featureFlags, loading, checkFeature, refreshFlags, clearCache };
};

// Helper function to trigger flag refresh from anywhere
export const triggerFlagsRefresh = () => {
  window.dispatchEvent(new Event('featureFlagsRefresh'));
};

// Helper function to clear flags cache (use on logout)
export const clearFlagsCache = () => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(CACHE_KEY);
  }
  globalFlagsCache = null;
  globalFlagsTimestamp = null;
  globalFlagsPromise = null;
  isFetching = false;
};

