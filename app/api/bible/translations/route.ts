import { NextResponse } from "next/server";

import { LOCAL_BIBLE_VERSIONS } from "@/lib/bible";
import { getBibleCatalog } from "@/lib/bible-catalog";
import { logEvent } from "@/lib/logger";
import { captureServerException } from "@/lib/sentry";

const AVAILABLE_CACHE_CONTROL =
  "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800";
const DEGRADED_CACHE_CONTROL =
  "public, max-age=30, s-maxage=300, stale-while-revalidate=3600";

export async function GET() {
  try {
    const catalog = await getBibleCatalog();
    return NextResponse.json(catalog, {
      headers: {
        "Cache-Control": catalog.remoteAvailable
          ? AVAILABLE_CACHE_CONTROL
          : DEGRADED_CACHE_CONTROL
      }
    });
  } catch (error) {
    captureServerException(error, { route: "/api/bible/translations" });
    logEvent("error", "bible_catalog.failure", {
      route: "/api/bible/translations",
      error
    });
    return NextResponse.json(
      {
        translations: LOCAL_BIBLE_VERSIONS,
        remoteAvailable: false,
        warning:
          "The multilingual catalog is temporarily unavailable. Other configured translations remain available."
      },
      { headers: { "Cache-Control": DEGRADED_CACHE_CONTROL } }
    );
  }
}
