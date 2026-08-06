"use client";

import { useEffect, useMemo, useState } from "react";

import { loadBibleCatalog } from "@/lib/bible-catalog-client";
import { getBibleLanguageOptions } from "@/lib/bible-version-search";
import { BibleVersion, LOCAL_BIBLE_VERSIONS } from "@/lib/bible";

type Props = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

export function LanguagePicker({
  id,
  label,
  value,
  onChange,
  disabled = false
}: Props) {
  const [translations, setTranslations] = useState<BibleVersion[]>(() => [
    ...LOCAL_BIBLE_VERSIONS
  ]);

  useEffect(() => {
    let mounted = true;
    void loadBibleCatalog().then((catalog) => {
      if (mounted) {
        setTranslations(catalog.translations);
      }
    }).catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const languages = useMemo(
    () => getBibleLanguageOptions(translations),
    [translations]
  );
  const hasSelectedLanguage = languages.some(
    (language) => language.iso === value.toLowerCase()
  );

  return (
    <label htmlFor={id}>
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        {!hasSelectedLanguage ? (
          <option value={value}>{value.toUpperCase()}</option>
        ) : null}
        {languages.map((language) => (
          <option key={language.iso} value={language.iso}>
            {language.name} ({language.iso.toUpperCase()})
          </option>
        ))}
      </select>
    </label>
  );
}
