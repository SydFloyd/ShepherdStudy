"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ScriptureAttribution } from "@/components/scripture-attribution";
import { TranslationPicker } from "@/components/translation-picker";
import { useAuthStatus } from "@/hooks/use-auth-status";
import {
  BibleSourceInfo,
  DEFAULT_BIBLE_TRANSLATION,
  getLocalBibleVersion,
  getTranslationLabel,
  MemorizationTranslationId,
  toBibleSourceInfo
} from "@/lib/bible";
import type { RecallAssessment, RecallToken } from "@/lib/memorization-recall";
import { parseJsonSafe } from "@/lib/study-client-utils";

type Passage = {
  id: string;
  translation: string;
  reference: string;
  book: string;
  bookOrder: number;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  isWholeChapter: boolean;
  text: string;
  verses: Array<{ verse: number; text: string }>;
  editionSnapshot: BibleSourceInfo | null;
  textAttemptCount: number;
  latestTextScore: number | null;
  bestTextScore: number | null;
  referenceAttemptCount: number;
  latestReferenceScore: number | null;
  bestReferenceScore: number | null;
  lastPracticedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Recommendation = {
  reference: string;
  reason: string;
};

type WorkspacePayload = {
  preferredTranslation: MemorizationTranslationId;
  passages: Passage[];
  recommendations: Recommendation[] | null;
  recommendationsStale: boolean;
};

type AttemptMode = "TEXT" | "REFERENCE";
type TestDirection = AttemptMode | "MIXED";

function formatScore(score: number | null) {
  return score === null ? "Not practiced" : `${score}%`;
}

function translationLabel(
  translation: string,
  source?: BibleSourceInfo | null
) {
  return (
    source?.vernacularTitle ||
    source?.title ||
    getTranslationLabel(translation)
  );
}

function getTranslationSource(
  translation: string,
  source?: BibleSourceInfo | null
): BibleSourceInfo | null {
  if (source) {
    return source;
  }
  const version = getLocalBibleVersion(translation);
  return version ? toBibleSourceInfo(version) : null;
}

function TranslationName({
  translation,
  source
}: {
  translation: string;
  source?: BibleSourceInfo | null;
}) {
  const resolvedSource = getTranslationSource(translation, source);
  return (
    <bdi dir="auto" lang={resolvedSource?.languageIso}>
      {translationLabel(translation, source)}
    </bdi>
  );
}

function getPassageSource(passage: Passage): BibleSourceInfo | null {
  return getTranslationSource(passage.translation, passage.editionSnapshot);
}

function RecallTokens({ tokens }: { tokens: RecallToken[] }) {
  if (tokens.length === 0) {
    return <span className="muted">No words entered.</span>;
  }

  return (
    <span className="memorizeRecallTokens">
      {tokens.map((token, index) => (
        <span
          key={`${token.text}-${index}`}
          className={`memorizeRecallToken ${token.status}`}
        >
          {token.text}
          <span className="srOnly"> ({token.status})</span>
        </span>
      ))}
    </span>
  );
}

function PassageText({ passage }: { passage: Passage }) {
  const source = getPassageSource(passage);
  return (
    <>
      <div
        className="memorizePassageText scriptureText"
        dir={source?.direction ?? "ltr"}
        lang={source?.languageIso}
      >
        {passage.verses.map((verse) => (
          <span key={verse.verse} className="memorizeVerseText">
            <span className="verseNumber">{verse.verse}</span>
            {" "}
            {verse.text}{" "}
          </span>
        ))}
      </div>
      <ScriptureAttribution source={source} />
    </>
  );
}

function AssessmentPanel({
  assessment,
  source,
  showAttribution = true
}: {
  assessment: RecallAssessment;
  source?: BibleSourceInfo | null;
  showAttribution?: boolean;
}) {
  return (
    <section className="memorizeAssessment" aria-live="polite">
      <h3>{assessment.score}% correct</h3>
      <p className="muted">
        {assessment.matchedWords} of {assessment.expectedWordCount} expected
        words matched. Capitalization and punctuation are ignored.
      </p>
      <div className="memorizeAssessmentGrid">
        <div>
          <h4>Your answer</h4>
          <p dir={source?.direction} lang={source?.languageIso}>
            <RecallTokens tokens={assessment.submitted} />
          </p>
        </div>
        <div>
          <h4>Expected</h4>
          <p dir={source?.direction} lang={source?.languageIso}>
            <RecallTokens tokens={assessment.expected} />
          </p>
          <p className="muted memorizeLegend">
            Matched words are green. Incorrect or missing words are red and
            underlined.
          </p>
        </div>
      </div>
      {showAttribution ? <ScriptureAttribution source={source} /> : null}
    </section>
  );
}

function shufflePassageIds(passages: Passage[]) {
  const ids = passages.map((passage) => passage.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }
  return ids;
}

export default function MemorizePage() {
  const router = useRouter();
  const { status } = useAuthStatus();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAssessing, setIsAssessing] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [preferredTranslation, setPreferredTranslation] =
    useState<MemorizationTranslationId>(DEFAULT_BIBLE_TRANSLATION);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [recommendations, setRecommendations] = useState<
    Recommendation[] | null
  >(null);
  const [recommendationsStale, setRecommendationsStale] = useState(false);
  const [referenceInput, setReferenceInput] = useState("");
  const [selectedPassageId, setSelectedPassageId] = useState<string | null>(
    null
  );
  const [activeView, setActiveView] = useState<
    "practice" | "test" | "progress"
  >("practice");
  const [practiceInput, setPracticeInput] = useState("");
  const [practiceAssessment, setPracticeAssessment] =
    useState<RecallAssessment | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [testDirection, setTestDirection] =
    useState<TestDirection>("MIXED");
  const [testQueue, setTestQueue] = useState<string[]>([]);
  const [testIndex, setTestIndex] = useState(0);
  const [testMode, setTestMode] = useState<AttemptMode>("TEXT");
  const [testInput, setTestInput] = useState("");
  const [testAssessment, setTestAssessment] =
    useState<RecallAssessment | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedPassage = useMemo(
    () => passages.find((passage) => passage.id === selectedPassageId) ?? null,
    [passages, selectedPassageId]
  );
  const testPassage = useMemo(() => {
    const id = testQueue[testIndex];
    return passages.find((passage) => passage.id === id) ?? null;
  }, [passages, testIndex, testQueue]);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    const response = await fetch("/api/memorize", { cache: "no-store" });
    const payload = (await parseJsonSafe(response)) as
      | WorkspacePayload
      | { error?: string };

    if (response.status === 401) {
      router.replace("/login");
      return;
    }
    if (!response.ok || !("passages" in payload)) {
      setError(
        ("error" in payload && payload.error) ||
          "Unable to load memorization progress."
      );
      setIsLoading(false);
      return;
    }

    setPreferredTranslation(payload.preferredTranslation);
    setPassages(payload.passages);
    setRecommendations(payload.recommendations);
    setRecommendationsStale(payload.recommendationsStale);
    setSelectedPassageId((current) =>
      current && payload.passages.some((passage) => passage.id === current)
        ? current
        : payload.passages[0]?.id ?? null
    );
    setIsLoading(false);
  }, [router]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
      return;
    }
    if (status === "authenticated") {
      void loadWorkspace();
    }
  }, [loadWorkspace, router, status]);

  function clearPracticeResult() {
    setPracticeInput("");
    setPracticeAssessment(null);
    setShowOriginal(false);
  }

  function replacePassage(updated: Passage) {
    setPassages((current) =>
      current.map((passage) =>
        passage.id === updated.id ? updated : passage
      )
    );
  }

  async function addPassage(reference: string) {
    const normalizedReference = reference.trim();
    if (!normalizedReference) {
      return false;
    }

    setIsSaving(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/memorize/passages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference: normalizedReference,
        translation: preferredTranslation
      })
    });
    const payload = (await parseJsonSafe(response)) as {
      passage?: Passage;
      error?: string;
    };
    setIsSaving(false);

    if (!response.ok || !payload.passage) {
      setError(payload.error ?? "Unable to save that passage.");
      return false;
    }

    setPassages((current) =>
      [...current, payload.passage as Passage].sort(
        (left, right) =>
          left.bookOrder - right.bookOrder ||
          left.chapter - right.chapter ||
          left.verseStart - right.verseStart
      )
    );
    setSelectedPassageId(payload.passage.id);
    setRecommendations(null);
    setRecommendationsStale(true);
    setMessage(`${payload.passage.reference} added as one practice passage.`);
    clearPracticeResult();
    return true;
  }

  async function onAddPassage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await addPassage(referenceInput)) {
      setReferenceInput("");
      setActiveView("practice");
    }
  }

  async function savePreferredTranslation() {
    setIsSaving(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preferredTranslation })
    });
    const payload = (await parseJsonSafe(response)) as { error?: string };
    setIsSaving(false);
    if (!response.ok) {
      setError(payload.error ?? "Unable to update your preferred translation.");
      return;
    }
    setRecommendations(null);
    setRecommendationsStale(true);
    setMessage(
      `Preferred translation changed to ${translationLabel(preferredTranslation)}. Existing saved passages keep their original versions.`
    );
  }

  async function submitAttempt(input: {
    passageId: string;
    mode: AttemptMode;
    responseText: string;
  }) {
    setIsAssessing(true);
    setError(null);
    const response = await fetch("/api/memorize/attempts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        passageId: input.passageId,
        mode: input.mode,
        response: input.responseText
      })
    });
    const payload = (await parseJsonSafe(response)) as {
      assessment?: RecallAssessment;
      passage?: Passage;
      error?: string;
    };
    setIsAssessing(false);

    if (!response.ok || !payload.assessment || !payload.passage) {
      setError(payload.error ?? "Unable to assess that answer.");
      return null;
    }
    replacePassage(payload.passage);
    return payload.assessment;
  }

  async function onPracticeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedPassage) {
      return;
    }
    const result = await submitAttempt({
      passageId: selectedPassage.id,
      mode: "TEXT",
      responseText: practiceInput
    });
    if (result) {
      setPracticeAssessment(result);
      setShowOriginal(
        getPassageSource(selectedPassage)?.provider !== "esv"
      );
    }
  }

  function chooseTestMode() {
    if (testDirection === "MIXED") {
      return Math.random() < 0.5 ? "TEXT" : "REFERENCE";
    }
    return testDirection;
  }

  function startTest() {
    if (passages.length === 0) {
      return;
    }
    setTestQueue(shufflePassageIds(passages));
    setTestIndex(0);
    setTestMode(chooseTestMode());
    setTestInput("");
    setTestAssessment(null);
    setError(null);
  }

  function nextTestCard() {
    if (testIndex + 1 >= testQueue.length) {
      startTest();
      return;
    }
    setTestIndex((current) => current + 1);
    setTestMode(chooseTestMode());
    setTestInput("");
    setTestAssessment(null);
  }

  async function onTestSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!testPassage) {
      return;
    }
    const result = await submitAttempt({
      passageId: testPassage.id,
      mode: testMode,
      responseText: testInput
    });
    if (result) {
      setTestAssessment(result);
    }
  }

  async function removePassage(passageId: string) {
    if (pendingDeleteId !== passageId) {
      setPendingDeleteId(passageId);
      return;
    }

    setIsSaving(true);
    setError(null);
    const response = await fetch("/api/memorize/passages", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passageId })
    });
    const payload = (await parseJsonSafe(response)) as { error?: string };
    setIsSaving(false);
    setPendingDeleteId(null);
    if (!response.ok) {
      setError(payload.error ?? "Unable to remove that passage.");
      return;
    }

    setPassages((current) => current.filter((item) => item.id !== passageId));
    if (selectedPassageId === passageId) {
      setSelectedPassageId(null);
      clearPracticeResult();
    }
    setTestQueue([]);
    setRecommendations(null);
    setRecommendationsStale(true);
    setMessage("Passage and its saved attempt history removed.");
  }

  async function requestRecommendations() {
    setIsRecommending(true);
    setError(null);
    setMessage(null);
    const response = await fetch("/api/memorize/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    const payload = (await parseJsonSafe(response)) as {
      recommendations?: Recommendation[];
      cached?: boolean;
      error?: string;
    };
    setIsRecommending(false);
    if (!response.ok || !payload.recommendations) {
      setError(payload.error ?? "Unable to recommend passages.");
      return;
    }

    setRecommendations(payload.recommendations);
    setRecommendationsStale(false);
    setMessage(
      payload.cached
        ? "Loaded your cached suggestions."
        : "Created suggestions for your current memorization list."
    );
  }

  if (status === "loading" || isLoading) {
    return (
      <section className="card">
        <h1>Memorize</h1>
        <p className="muted">Loading your memorization passages...</p>
      </section>
    );
  }

  if (status !== "authenticated") {
    return (
      <section className="card">
        <h1>Memorize</h1>
        <p className="muted">Please sign in to save memorization progress.</p>
      </section>
    );
  }

  return (
    <section className="grid memorizePage">
      <article className="card memorizeHeaderCard">
        <div>
          <h1>Memorize Scripture</h1>
          <p className="muted">
            Practice one verse, a contiguous range, or a whole chapter as one
            saved passage. Progress reflects recall accuracy, not a streak.
          </p>
        </div>
        <div className="memorizeTranslationControl">
          <TranslationPicker
            id="memorize-preferred-translation"
            label="Preferred translation"
            value={preferredTranslation}
            onChange={setPreferredTranslation}
            disabled={isSaving}
          />
          <button
            type="button"
            onClick={() => void savePreferredTranslation()}
            disabled={isSaving}
          >
            Save preference
          </button>
        </div>
      </article>

      <article className="card">
        <form className="memorizeAddForm" onSubmit={onAddPassage}>
          <label>
            Add a passage
            <input
              value={referenceInput}
              onChange={(event) => setReferenceInput(event.target.value)}
              placeholder="John 3:16, Romans 8:1-4, or Psalm 23"
              maxLength={120}
              required
            />
          </label>
          <button type="submit" disabled={isSaving}>
            {isSaving ? "Saving..." : "Add to memorization"}
          </button>
        </form>
        <p className="muted memorizeAddHint">
          The reference is verified against the selected Bible edition before
          it is saved. A range or whole chapter remains one progress item.
        </p>
      </article>

      {message ? <p className="memorizeMessage" role="status">{message}</p> : null}
      {error ? <p className="muted" role="alert">{error}</p> : null}

      <div className="memorizeTabs" role="tablist" aria-label="Memorization modes">
        {(["practice", "test", "progress"] as const).map((view) => (
          <button
            key={view}
            type="button"
            role="tab"
            aria-selected={activeView === view}
            className={activeView === view ? "active" : ""}
            onClick={() => setActiveView(view)}
          >
            {view === "practice"
              ? "Practice"
              : view === "test"
                ? "Test all"
                : "Progress & next passages"}
          </button>
        ))}
      </div>

      {activeView === "practice" ? (
        <div className="memorizeWorkspace">
          <aside className="card memorizeLibrary">
            <h2>Saved passages</h2>
            {passages.length === 0 ? (
              <p className="muted">Add your first passage above.</p>
            ) : (
              <div className="memorizeLibraryList">
                {passages.map((passage) => (
                  <button
                    key={passage.id}
                    type="button"
                    className={
                      selectedPassageId === passage.id ? "active" : ""
                    }
                    onClick={() => {
                      setSelectedPassageId(passage.id);
                      clearPracticeResult();
                    }}
                  >
                    <span>{passage.reference}</span>
                    <small>
                      <TranslationName
                        translation={passage.translation}
                        source={passage.editionSnapshot}
                      />{" "}
                      · Latest {formatScore(passage.latestTextScore)}
                    </small>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <article className="card memorizePracticeCard">
            {selectedPassage ? (
              <>
                <div className="memorizePracticeHeader">
                  <div>
                    <p className="pill">
                      <TranslationName
                        translation={selectedPassage.translation}
                        source={selectedPassage.editionSnapshot}
                      />
                    </p>
                    <h2>Write {selectedPassage.reference} from memory</h2>
                  </div>
                  <button
                    type="button"
                    className="secondaryButton"
                    onClick={() => {
                      if (
                        getPassageSource(selectedPassage)?.provider === "esv" &&
                        practiceAssessment
                      ) {
                        setPracticeAssessment(null);
                      }
                      setShowOriginal((current) => !current);
                    }}
                  >
                    {showOriginal ? "Hide passage" : "Reveal passage"}
                  </button>
                </div>

                {showOriginal ? <PassageText passage={selectedPassage} /> : null}

                <form className="grid" onSubmit={onPracticeSubmit}>
                  <label>
                    Your recall
                    <textarea
                      value={practiceInput}
                      onChange={(event) => setPracticeInput(event.target.value)}
                      rows={Math.min(
                        16,
                        Math.max(5, selectedPassage.verses.length + 3)
                      )}
                      maxLength={50_000}
                      placeholder="Type the passage without looking..."
                      dir={getPassageSource(selectedPassage)?.direction}
                      lang={getPassageSource(selectedPassage)?.languageIso}
                    />
                  </label>
                  <button type="submit" disabled={isAssessing}>
                    {isAssessing ? "Checking..." : "Check recall"}
                  </button>
                </form>

                {practiceAssessment ? (
                  <AssessmentPanel
                    assessment={practiceAssessment}
                    source={getPassageSource(selectedPassage)}
                    showAttribution={!showOriginal}
                  />
                ) : null}
              </>
            ) : (
              <p className="muted">
                Select or add a passage to begin practicing.
              </p>
            )}
          </article>
        </div>
      ) : null}

      {activeView === "test" ? (
        <article className="card memorizeTestCard">
          <div className="memorizeTestControls">
            <label>
              Test direction
              <select
                value={testDirection}
                onChange={(event) =>
                  setTestDirection(event.target.value as TestDirection)
                }
              >
                <option value="MIXED">Mixed</option>
                <option value="TEXT">Address → passage</option>
                <option value="REFERENCE">Passage → address</option>
              </select>
            </label>
            <button type="button" onClick={startTest} disabled={passages.length === 0}>
              {testQueue.length > 0 ? "Shuffle and restart" : "Start test"}
            </button>
          </div>

          {testPassage ? (
            <div className="memorizeTestPrompt">
              <p className="muted">
                Card {testIndex + 1} of {testQueue.length} ·{" "}
                <TranslationName
                  translation={testPassage.translation}
                  source={testPassage.editionSnapshot}
                />
              </p>
              {testMode === "TEXT" ? (
                <h2>{testPassage.reference}</h2>
              ) : (
                <PassageText passage={testPassage} />
              )}

              <form className="grid" onSubmit={onTestSubmit}>
                <label>
                  {testMode === "TEXT" ? "Write the passage" : "Write the address"}
                  {testMode === "TEXT" ? (
                    <textarea
                      value={testInput}
                      onChange={(event) => setTestInput(event.target.value)}
                      rows={Math.min(16, Math.max(5, testPassage.verses.length + 3))}
                      maxLength={50_000}
                      dir={getPassageSource(testPassage)?.direction}
                      lang={getPassageSource(testPassage)?.languageIso}
                    />
                  ) : (
                    <input
                      value={testInput}
                      onChange={(event) => setTestInput(event.target.value)}
                      placeholder="Book chapter:verse-range"
                      maxLength={120}
                    />
                  )}
                </label>
                <button type="submit" disabled={isAssessing || Boolean(testAssessment)}>
                  {isAssessing ? "Checking..." : "Check answer"}
                </button>
              </form>

              {testAssessment ? (
                <>
                  <AssessmentPanel
                    assessment={testAssessment}
                    source={getPassageSource(testPassage)}
                    showAttribution={testMode === "TEXT"}
                  />
                  <button type="button" onClick={nextTestCard}>
                    {testIndex + 1 >= testQueue.length
                      ? "Start another round"
                      : "Next card"}
                  </button>
                </>
              ) : null}
            </div>
          ) : (
            <p className="muted">
              {passages.length === 0
                ? "Add at least one passage before starting a test."
                : "Choose a direction and start when you are ready."}
            </p>
          )}
        </article>
      ) : null}

      {activeView === "progress" ? (
        <>
          <article className="card">
            <h2>Passage progress</h2>
            {passages.length === 0 ? (
              <p className="muted">No saved passages yet.</p>
            ) : (
              <div className="memorizeProgressList">
                {passages.map((passage) => (
                  <section key={passage.id} className="memorizeProgressItem">
                    <div>
                      <h3>{passage.reference}</h3>
                      <p className="muted">
                        <TranslationName
                          translation={passage.translation}
                          source={passage.editionSnapshot}
                        />{" "}
                        · {passage.verses.length}{" "}
                        {passage.verses.length === 1 ? "verse" : "verses"}
                      </p>
                    </div>
                    <dl>
                      <div>
                        <dt>Latest passage</dt>
                        <dd>{formatScore(passage.latestTextScore)}</dd>
                      </div>
                      <div>
                        <dt>Best passage</dt>
                        <dd>{formatScore(passage.bestTextScore)}</dd>
                      </div>
                      <div>
                        <dt>Latest address</dt>
                        <dd>{formatScore(passage.latestReferenceScore)}</dd>
                      </div>
                      <div>
                        <dt>Attempts</dt>
                        <dd>{passage.textAttemptCount + passage.referenceAttemptCount}</dd>
                      </div>
                    </dl>
                    <button
                      type="button"
                      className="dangerButton"
                      onClick={() => void removePassage(passage.id)}
                      disabled={isSaving}
                    >
                      {pendingDeleteId === passage.id
                        ? "Confirm remove"
                        : "Remove"}
                    </button>
                  </section>
                ))}
              </div>
            )}
          </article>

          <article className="card memorizeRecommendationsCard">
            <div>
              <h2>Suggested next passages</h2>
              <p className="muted">
                AI-assisted suggestions are verified against your selected Bible
                edition and cached for your current saved set. Adding or removing
                a passage makes the cache stale; practice scores do not.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void requestRecommendations()}
              disabled={isRecommending || Boolean(recommendations)}
            >
              {isRecommending
                ? "Finding passages..."
                : recommendations
                  ? "Suggestions cached"
                  : recommendationsStale
                    ? "Update suggestions"
                    : "Suggest next passages"}
            </button>

            {recommendations ? (
              <div className="memorizeRecommendationList">
                {recommendations.map((recommendation) => (
                  <section key={recommendation.reference}>
                    <div>
                      <h3>{recommendation.reference}</h3>
                      <p>{recommendation.reason}</p>
                    </div>
                    <button
                      type="button"
                      className="secondaryButton"
                      onClick={() => void addPassage(recommendation.reference)}
                      disabled={isSaving}
                    >
                      Add passage
                    </button>
                  </section>
                ))}
              </div>
            ) : null}
          </article>
        </>
      ) : null}
    </section>
  );
}
