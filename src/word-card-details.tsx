import type { WordCardContent } from "./word-cards";

export default function WordCardDetails({ item }: { item: WordCardContent }) {
  const { phonetics, examples, hasMeanings } = item;
  return (
    <div className="word-card-details">
      {phonetics.length > 0 || item.forms.length > 1 ? (
        <p className="word-card-forms" lang="sv">
          {phonetics.length > 0 ? <span>[{phonetics.join(", ")}]</span> : null}
          {phonetics.length > 0 && item.forms.length > 1 ? " " : null}
          {item.forms.length > 1 ? <span>{item.forms.join(", ")}</span> : null}
        </p>
      ) : null}
      {hasMeanings ? (
        <div className="word-card-senses">
          {item.senses.map((sense, index) => (
            <p key={`${sense.meaning}-${sense.translation}-${index}`}>
              {sense.meaning.length > 0 ? <span lang="sv">{sense.meaning}</span> : null}
              {sense.translation.length > 0 ? <span lang="ru">{sense.translation}</span> : null}
            </p>
          ))}
        </div>
      ) : null}
      {examples.length > 0 ? (
        <section aria-label={`Examples for ${item.headword}`}>
          <h3>Examples</h3>
          <ul role="list">
            {examples.map((example, index) => (
              <li key={`${example.swedish}-${example.russian}-${index}`}>
                <span lang="sv">{example.swedish}</span>
                {example.russian.length > 0 ? <span lang="ru">{example.russian}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {item.relatedWords.length > 0 ? (
        <section aria-label={`Words containing ${item.headword}`}>
          <h3>More with <span lang="sv">{item.headword}</span></h3>
          <ul role="list">
            {item.relatedWords.map((relatedWord) => (
              <li key={relatedWord.headword}>
                <span lang="sv">{relatedWord.headword}</span>
                {relatedWord.translation.length > 0 ? <span lang="ru">{relatedWord.translation}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
