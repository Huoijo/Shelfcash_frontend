/**
 * Google Maps JavaScript API Dynamic Loader
 * Safely loads the Google Maps JS SDK as a singleton promise, preventing multiple script injections.
 */

let loadPromise: Promise<typeof google> | null = null;

export interface GoogleMapsLoaderOptions {
  apiKey?: string;
  libraries?: string[];
  language?: string;
}

export function isGoogleMapsLoaded(): boolean {
  return typeof window !== "undefined" && Boolean(window.google?.maps);
}

export function loadGoogleMapsScript(
  options: GoogleMapsLoaderOptions = {}
): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps cannot be loaded on the server."));
  }

  if (isGoogleMapsLoaded()) {
    return Promise.resolve(window.google);
  }

  if (loadPromise) {
    return loadPromise;
  }

  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    return Promise.reject(new Error("Google Maps API key is missing or not configured."));
  }

  loadPromise = new Promise<typeof google>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[src*="maps.googleapis.com/maps/api/js"]'
    );

    if (existingScript) {
      if (isGoogleMapsLoaded()) {
        resolve(window.google);
        return;
      }
      existingScript.addEventListener("load", () => {
        if (window.google) resolve(window.google);
        else reject(new Error("Google Maps script loaded but window.google is undefined."));
      });
      existingScript.addEventListener("error", (err) => {
        loadPromise = null;
        reject(new Error(`Failed to load Google Maps script: ${err}`));
      });
      return;
    }

    const script = document.createElement("script");
    const libraries = (options.libraries || ["places", "geometry"]).join(",");
    const language = options.language || "vi";

    const callbackName = `__shelfcash_init_google_maps_${Date.now()}`;

    // Expose global callback
    (window as unknown as Record<string, () => void>)[callbackName] = () => {
      delete (window as unknown as Record<string, unknown>)[callbackName];
      if (window.google) {
        resolve(window.google);
      } else {
        loadPromise = null;
        reject(new Error("Google Maps initialization callback fired, but window.google is missing."));
      }
    };

    script.id = "shelfcash-google-maps-script";
    script.type = "text/javascript";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=${libraries}&language=${language}&callback=${callbackName}&loading=async`;

    const timeout = setTimeout(() => {
      loadPromise = null;
      script.remove();
      reject(new Error("Google Maps script loading timed out."));
    }, 12000);

    script.onerror = () => {
      clearTimeout(timeout);
      loadPromise = null;
      script.remove();
      reject(new Error("Không thể tải Google Maps API. Vui lòng kiểm tra kết nối mạng hoặc API key."));
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}
