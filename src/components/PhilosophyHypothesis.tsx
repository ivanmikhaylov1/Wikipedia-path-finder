import { ArrowRight, ArrowUpRight } from 'lucide-react';

const examples = [
  { from: 'Помидор', to: 'Философия' },
  { from: 'Гитара', to: 'Философия' },
] as const;

export function PhilosophyHypothesis({ onQuickSearch }: { onQuickSearch: (from: string, to: string) => void }) {
  return <section className="philosophy-section" id="philosophy">
    <div className="page-width">
      <div className="section-kicker"><span>04 / ГИПОТЕЗА</span><span>ПЕРВАЯ ССЫЛКА · EN WIKIPEDIA</span></div>
      <div className="philosophy-layout">
        <div className="philosophy-heading">
          <h2>Всё ведёт<br />к философии<span>.</span></h2>
          <p className="philosophy-history">Замечено в 2008 году. Широкую известность феномен получил после комикса xkcd в 2011-м.</p>
        </div>
        <div className="philosophy-content">
          <p className="philosophy-lead">Если в любой статье английской Википедии переходить по первой ссылке в основном тексте и повторять это для каждой следующей статьи, почти всегда оказываешься на статье «Philosophy». По замеру февраля 2016 года — в 97% случаев, медианная цепочка — 23 перехода. Причина не в прямых ссылках на философию: первая ссылка обычно ведёт к более общему понятию, и цепочка обобщений рано или поздно упирается в самое общее из всех.</p>
          <div className="philosophy-examples">
            <span className="philosophy-example-label">ПОПРОБУЙТЕ САМИ / RU WIKIPEDIA</span>
            <div className="philosophy-chips">
              {examples.map(({ from, to }) => <button type="button" className="philosophy-chip" key={from} onClick={() => onQuickSearch(from, to)}>
                {from} <ArrowRight size={14} strokeWidth={1.7} aria-hidden="true" /> {to}
              </button>)}
            </div>
            <p className="philosophy-disclaimer">Это не то же самое, что кликать первую ссылку — здесь ищется кратчайший путь по всем ссылкам сразу. Проверьте, короче ли он.</p>
          </div>
          <a className="philosophy-source" href="https://en.wikipedia.org/wiki/Wikipedia_philosophy_phenomenon" target="_blank" rel="noopener noreferrer">ПОДРОБНЕЕ О ФЕНОМЕНЕ <ArrowUpRight size={17} strokeWidth={1.6} /></a>
        </div>
      </div>
    </div>
  </section>;
}
