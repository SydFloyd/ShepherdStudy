import {
  BibleVersion,
  getLocalBibleVersion,
  isDbsTranslation,
  isEsvTranslation,
  LOCAL_BIBLE_VERSIONS
} from "@/lib/bible";
import {
  DbsBibleError,
  getDbsBibleCatalog,
  getDbsBibleVersion
} from "@/lib/dbs-bible";
import { ESV_VERSION, isEsvConfigured } from "@/lib/esv-bible";

function baseVersions() {
  return isEsvConfigured()
    ? [...LOCAL_BIBLE_VERSIONS, ESV_VERSION]
    : [...LOCAL_BIBLE_VERSIONS];
}

export type BibleCatalog = {
  translations: BibleVersion[];
  remoteAvailable: boolean;
};

export async function getBibleCatalog(): Promise<BibleCatalog> {
  try {
    const remoteVersions = await getDbsBibleCatalog();
    return {
      translations: [...baseVersions(), ...remoteVersions],
      remoteAvailable: true
    };
  } catch (error) {
    if (!(error instanceof DbsBibleError)) {
      throw error;
    }
    return {
      translations: baseVersions(),
      remoteAvailable: false
    };
  }
}

export async function getBibleVersion(
  translation: string
): Promise<BibleVersion | null> {
  const localVersion = getLocalBibleVersion(translation);
  if (localVersion) {
    return localVersion;
  }
  if (isEsvTranslation(translation)) {
    return isEsvConfigured() ? ESV_VERSION : null;
  }
  if (!isDbsTranslation(translation)) {
    return null;
  }
  return getDbsBibleVersion(translation);
}
