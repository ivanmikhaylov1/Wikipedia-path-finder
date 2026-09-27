import { ArrowUpRight } from 'lucide-react';
import { RaceMode, type RacePair } from './RaceMode';

export function SpeedrunSection({ pair, shortestClicks, onNewPair }: {
  pair: RacePair | null;
  shortestClicks: number | null;
  onNewPair: (pair: RacePair) => void;
}) {
  return <section className="speedrun-section" id="speedrun">
    <div className="page-width">
      <div className="section-kicker"><span>04 / ИГРА НА СКОРОСТЬ</span><span>WIKIRACING · WIKISPEEDIA · WIKIWARS</span></div>
      <div className="speedrun-editorial">
        <div><span className="speedrun-overline">АРХИВ / КОНЕЦ 2000-Х</span><h2>Это давно<br />чья-то игра<span>.</span></h2></div>
        <div className="speedrun-copy"><p>WikiRacing, The Wikipedia Game, Wikispeedia, Wikiwars — разные имена одной задачи: добраться от статьи А до статьи Б только по внутренним ссылкам. Соревнуются во времени или в числе кликов.</p><p>В строгих партиях договариваются обходить слишком общие страницы: даты и страны вроде США, Великобритании и Канады. Поиск через Ctrl+F и автоматические инструменты поиска пути тоже исключают. Это правила конкретной гонки, а не ограничения нашего алгоритма.</p><a href="https://en.wikipedia.org/wiki/Wikiracing" target="_blank" rel="noopener noreferrer">ИСТОЧНИК: WIKIRACING <ArrowUpRight size={16} /></a></div>
        <div className="speedrun-stat"><span>ПОЧЕМУ ИНОГДА ЗАПРЕЩАЮТ UNITED KINGDOM</span><strong>3.67</strong><p>Столько ссылок в среднем отделяет любую статью английской Википедии от «United Kingdom». Слишком удобная цель для гонки.</p></div>
      </div>
      <RaceMode pair={pair} shortestClicks={shortestClicks} onNewPair={onNewPair} />
    </div>
  </section>;
}
