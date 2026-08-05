import { TranslationPicker } from "@/components/translation-picker";
import { BibleTranslationId } from "@/lib/bible";

type Props = {
  passage: string;
  prompt: string;
  translation: BibleTranslationId;
  isLoading: boolean;
  onPassageChange: (value: string) => void;
  onPromptChange: (value: string) => void;
  onTranslationChange: (value: BibleTranslationId) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
};

export function StudyForm({
  passage,
  prompt,
  translation,
  isLoading,
  onPassageChange,
  onPromptChange,
  onTranslationChange,
  onSubmit
}: Props) {
  return (
    <form className="grid" onSubmit={onSubmit}>
      <div className="passageRow">
        <label className="passageField">
          Passage
          <input
            placeholder="Example: Matthew 6:25-34"
            value={passage}
            onChange={(event) => onPassageChange(event.target.value)}
          />
        </label>
        <TranslationPicker
          id="study-form-translation"
          className="versionField"
          label="Version"
          value={translation}
          onChange={onTranslationChange}
          disabled={isLoading}
        />
      </div>
      <label>
        Prompt
        <textarea
          rows={4}
          placeholder="Ask your study question or focus here."
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
        />
      </label>
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Thinking..." : "Go"}
      </button>
    </form>
  );
}
