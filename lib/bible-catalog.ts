import {
  BibleVersion,
  getLocalBibleVersion,
  isDbsTranslation,
  LOCAL_BIBLE_VERSIONS
} from "@/lib/bible";
import {
  DbsBibleError,
  getDbsBibleCatalog,
  getDbsBibleVersion
} from "@/lib/dbs-bible";

export type BibleCatalog = {
  translations: BibleVersion[];
  remoteAvailable: boolean;
};

export async function getBibleCatalog(): Promise<BibleCatalog> {
  try {
    const remoteVersions = await getDbsBibleCatalog();
    return {
      translations: [...LOCAL_BIBLE_VERSIONS, ...remoteVersions],
      remoteAvailable: true
    };
  } catch (error) {
    if (!(error instanceof DbsBibleError)) {
      throw error;
    }
    return {
      translations: [...LOCAL_BIBLE_VERSIONS],
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
  if (!isDbsTranslation(translation)) {
    return null;
  }
  return getDbsBibleVersion(translation);
}
