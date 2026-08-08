"use client";

import {
  ChangeEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";

import {
  BibleVersion,
  DEFAULT_BIBLE_LANGUAGE,
  getTranslationLabel,
  LOCAL_BIBLE_VERSIONS
} from "@/lib/bible";
import { loadBibleCatalog } from "@/lib/bible-catalog-client";
import {
  filterBibleVersionsByLanguage,
  getBibleLanguageOptions,
  mergeBibleVersions,
  searchBibleVersions,
  TRANSLATION_SEARCH_LIMIT
} from "@/lib/bible-version-search";
import { loadPreferredLanguage } from "@/lib/preferred-language-client";

type Props = {
  value: string;
  onChange: (value: string, version?: BibleVersion) => void;
  label: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  ariaDescribedBy?: string;
  className?: string;
  preferredLanguageIso?: string;
};

function getVersionMeta(version: BibleVersion): string {
  const providerName =
    version.provider === "dbs"
      ? "Digital Bible Society"
      : version.provider === "esv"
        ? "Crossway ESV API"
        : "Local";
  return [
    version.languageName,
    version.languageIso.toUpperCase(),
    version.script,
    providerName
  ]
    .filter(Boolean)
    .join(" \u00b7 ");
}

function getVersionDisplayName(version: BibleVersion): string {
  return version.label || version.vernacularTitle || version.title;
}

function getPickerOptions(
  translations: readonly BibleVersion[],
  query: string,
  selectedVersion: BibleVersion | null
): BibleVersion[] {
  const matches = searchBibleVersions(translations, query);
  if (
    query.trim() ||
    !selectedVersion ||
    !translations.some((version) => version.value === selectedVersion.value) ||
    matches.some((version) => version.value === selectedVersion.value)
  ) {
    return matches;
  }

  const firstRemoteIndex = matches.findIndex(
    (version) => version.provider === "dbs"
  );
  const insertionIndex =
    firstRemoteIndex === -1 ? matches.length : firstRemoteIndex;
  return [
    ...matches.slice(0, insertionIndex),
    selectedVersion,
    ...matches.slice(insertionIndex)
  ].slice(0, TRANSLATION_SEARCH_LIMIT);
}

export function TranslationPicker({
  value,
  onChange,
  label,
  id,
  name,
  disabled = false,
  required = false,
  ariaDescribedBy,
  className,
  preferredLanguageIso
}: Props) {
  const reactId = useId().replace(/:/g, "");
  const inputId = id ?? `translation-picker-${reactId}`;
  const listboxId = `${inputId}-listbox`;
  const statusId = `${inputId}-status`;
  const resultsId = `${inputId}-results`;
  const languageFilterId = `${inputId}-language`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const optionRefs = useRef(new Map<string, HTMLLIElement>());
  const [translations, setTranslations] = useState<BibleVersion[]>(() => [
    ...LOCAL_BIBLE_VERSIONS
  ]);
  const [catalogState, setCatalogState] = useState<
    "loading" | "ready" | "local-only"
  >("loading");
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [languageIso, setLanguageIso] = useState(
    preferredLanguageIso?.trim().toLowerCase() || DEFAULT_BIBLE_LANGUAGE
  );
  const languageChangedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    let mounted = true;
    void loadBibleCatalog()
      .then((catalog) => {
        if (!mounted) {
          return;
        }
        setTranslations(
          mergeBibleVersions(LOCAL_BIBLE_VERSIONS, catalog.translations)
        );
        setCatalogState(catalog.remoteAvailable ? "ready" : "local-only");
        setCatalogWarning(catalog.warning ?? null);
      })
      .catch(() => {
        if (!mounted) {
          return;
        }
        setCatalogState("local-only");
        setCatalogWarning(
          "The multilingual catalog is temporarily unavailable. Other configured translations remain available."
        );
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (preferredLanguageIso !== undefined) {
      setLanguageIso(
        preferredLanguageIso.trim().toLowerCase() || DEFAULT_BIBLE_LANGUAGE
      );
      setActiveIndex(0);
      return;
    }

    let mounted = true;
    void loadPreferredLanguage().then((preferredLanguage) => {
      if (mounted && !languageChangedRef.current) {
        setLanguageIso(preferredLanguage);
        setActiveIndex(0);
      }
    });
    return () => {
      mounted = false;
    };
  }, [preferredLanguageIso]);

  const selectedVersion = useMemo(
    () => translations.find((version) => version.value === value) ?? null,
    [translations, value]
  );
  const selectedLabel = selectedVersion
    ? getVersionDisplayName(selectedVersion)
    : getTranslationLabel(value);
  const languageOptions = useMemo(
    () => getBibleLanguageOptions(translations),
    [translations]
  );
  const languageFilteredTranslations = useMemo(
    () => filterBibleVersionsByLanguage(translations, languageIso),
    [languageIso, translations]
  );
  const options = useMemo(
    () =>
      getPickerOptions(languageFilteredTranslations, query, selectedVersion),
    [languageFilteredTranslations, query, selectedVersion]
  );
  const safeActiveIndex = options.length
    ? Math.min(activeIndex, options.length - 1)
    : -1;
  const activeOption =
    safeActiveIndex >= 0 ? options[safeActiveIndex] ?? null : null;

  useEffect(() => {
    if (!open || !activeOption) {
      return;
    }
    optionRefs.current.get(activeOption.value)?.scrollIntoView({
      block: "nearest"
    });
  }, [activeOption, open]);

  function selectVersion(version: BibleVersion) {
    onChange(version.value, version);
    setQuery("");
    setOpen(false);
    setActiveIndex(0);
  }

  function onInputChange(event: ChangeEvent<HTMLInputElement>) {
    setQuery(event.target.value);
    setOpen(true);
    setActiveIndex(0);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) =>
        options.length ? Math.min(current + 1, options.length - 1) : 0
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Home" && open) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && open) {
      event.preventDefault();
      setActiveIndex(Math.max(options.length - 1, 0));
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeOption) {
        selectVersion(activeOption);
      }
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setQuery("");
      setOpen(false);
    }
  }

  const statusText =
    catalogState === "loading"
      ? "Loading multilingual translations\u2026"
      : catalogState === "local-only"
        ? catalogWarning ??
          "The multilingual catalog is temporarily unavailable. Other configured translations remain available."
        : `${translations.length.toLocaleString()} translations available.`;

  return (
    <div
      className={`translationPicker${className ? ` ${className}` : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setQuery("");
          setOpen(false);
        }
      }}
    >
      <label htmlFor={inputId}>{label}</label>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div className="translationPickerInputWrap">
        <div className="translationPickerControl">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-activedescendant={
              open && activeOption
                ? `${inputId}-option-${safeActiveIndex}`
                : undefined
            }
            aria-describedby={
              [ariaDescribedBy, statusId, open ? resultsId : null]
                .filter(Boolean)
                .join(" ")
            }
            autoComplete="off"
            spellCheck={false}
            required={required}
            disabled={disabled}
            dir="auto"
            lang={!open ? selectedVersion?.languageIso : undefined}
            value={open ? query : selectedLabel}
            placeholder={open ? `Search from ${selectedLabel}` : undefined}
            onFocus={() => {
              setQuery("");
              setOpen(true);
              const browseOptions = getPickerOptions(
                languageFilteredTranslations,
                "",
                selectedVersion
              );
              setActiveIndex(
                Math.max(
                  browseOptions.findIndex((version) => version.value === value),
                  0
                )
              );
            }}
            onChange={onInputChange}
            onKeyDown={onKeyDown}
          />
          <button
            type="button"
            className="translationPickerToggle"
            aria-label={
              open ? "Close translation list" : "Open translation list"
            }
            aria-expanded={open}
            aria-controls={listboxId}
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              setOpen((current) => !current);
              setActiveIndex(0);
              inputRef.current?.focus();
            }}
          >
            <span aria-hidden="true">{"\u25be"}</span>
          </button>
        </div>

        {open ? (
          <div className="translationPickerPopover">
            <div className="translationPickerFilters">
              <label htmlFor={languageFilterId}>Language</label>
              <select
                id={languageFilterId}
                value={languageIso}
                onChange={(event) => {
                  languageChangedRef.current = true;
                  setLanguageIso(event.target.value);
                  setActiveIndex(0);
                }}
              >
                <option value="">All languages ({translations.length})</option>
                {languageOptions.map((language) => (
                  <option key={language.iso} value={language.iso}>
                    {language.name} ({language.iso.toUpperCase()}) — {language.count}
                  </option>
                ))}
              </select>
            </div>
            <ul id={listboxId} role="listbox" aria-label={label}>
              {options.map((version, index) => {
                const vernacularTitle =
                  version.vernacularTitle &&
                  version.vernacularTitle !== version.title &&
                  version.vernacularTitle !== version.label
                    ? version.vernacularTitle
                    : null;
                return (
                  <li
                    key={version.value}
                    ref={(node) => {
                      if (node) {
                        optionRefs.current.set(version.value, node);
                      } else {
                        optionRefs.current.delete(version.value);
                      }
                    }}
                    id={`${inputId}-option-${index}`}
                    role="option"
                    aria-selected={version.value === value}
                    className={
                      index === safeActiveIndex ? "isActive" : undefined
                    }
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectVersion(version)}
                  >
                    <span
                      className="translationPickerOptionTitle"
                      dir="auto"
                      lang={version.languageIso}
                    >
                      {getVersionDisplayName(version)}
                    </span>
                    {vernacularTitle ? (
                      <span
                        className="translationPickerVernacular"
                        dir="auto"
                        lang={version.languageIso}
                      >
                        {vernacularTitle}
                      </span>
                    ) : null}
                    <span className="translationPickerOptionMeta">
                      {getVersionMeta(version)}
                    </span>
                    {version.value === value ? (
                      <span
                        className="translationPickerSelected"
                        aria-hidden="true"
                      >
                        {"\u2713"}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {options.length === 0 ? (
              <p className="translationPickerEmpty">
                No translations match{query ? ` “${query}”` : ""}
                {languageIso ? " in the selected language." : "."}
              </p>
            ) : null}
            <p
              id={resultsId}
              className="translationPickerHint"
              aria-live="polite"
            >
              {options.length === TRANSLATION_SEARCH_LIMIT
                ? "Showing the first 50 matches. Keep typing to narrow the list."
                : `${options.length} matching translation${options.length === 1 ? "" : "s"}.`}
            </p>
          </div>
        ) : null}
      </div>

      <span
        id={statusId}
        className={`translationPickerStatus${
          catalogState === "local-only" ? " isWarning" : " isQuiet"
        }`}
        aria-live="polite"
      >
        {statusText}
      </span>
    </div>
  );
}
