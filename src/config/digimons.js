export const DIGIMON_STATS = Object.freeze([
  Object.freeze({ key: 'hp', label: 'HP' }),
  Object.freeze({ key: 'ds', label: 'DS' }),
  Object.freeze({ key: 'at', label: 'AT' }),
  Object.freeze({ key: 'de', label: 'DE' }),
  Object.freeze({ key: 'ct', label: 'CT' }),
  Object.freeze({ key: 'ev', label: 'EV' }),
]);

export const KOROMON = Object.freeze({
  id: 'koromon',
  number: '01',
  name: 'Koromon',
  kana: 'コロモン',
  level: 'In-Training',
  levelStage: 'Baby II',
  levelOriginal: '幼年期Ⅱ',
  type: 'Lesser',
  typeOriginal: 'レッサー型',
  attribute: 'None',
  attributeOriginal: 'なし',
  attack: Object.freeze({
    name: 'Bubble',
    original: '泡',
    romaji: 'Awa',
    description: 'Produz bolhas pela boca para intimidar os oponentes.',
  }),
  description:
    'Um pequeno Digimon que perdeu a penugem que cobria sua superfície e cujo corpo cresceu ainda mais. Embora consiga se movimentar com mais atividade, ele ainda não é capaz de batalhar. Pode produzir bolhas pela boca para intimidar os oponentes.',
  stats: Object.freeze({
    hp: null,
    ds: null,
    at: null,
    de: null,
    ct: null,
    ev: null,
  }),
  evolution: Object.freeze({
    previous: '?',
    next: '?',
    note: 'Linha evolutiva indisponível: dados não confirmados para esta ficha.',
  }),
  sources: Object.freeze([
    Object.freeze({
      label: 'Digimon Reference Book',
      url: 'https://digimon.net/reference/detail.php?directory_name=koromon',
    }),
    Object.freeze({
      label: 'Toei Animation — Digimon Adventure',
      url: 'http://www.toei-anim.co.jp/tv/dejimon/chara/koromon.html',
    }),
  ]),
});

export const TSUNOMON = Object.freeze({
  id: 'tsunomon',
  number: '02',
  name: 'Tsunomon',
  kana: 'ツノモン',
  level: 'In-Training',
  levelStage: 'Baby II',
  levelOriginal: '幼年期Ⅱ',
  type: 'Lesser',
  typeOriginal: 'レッサー型',
  attribute: 'None',
  attributeOriginal: 'なし',
  attack: Object.freeze({
    name: 'Bubbles',
    original: '泡',
    romaji: 'Awa',
    description: 'Sopra bolhas pela boca para atacar.',
  }),
  description:
    'Um pequeno Digimon cujo chifre se formou ao endurecer um dos tentáculos que possuía na cabeça quando era Punimon. Evoluiu em uma direção mais animal que Punimon e é coberto por pelos felpudos. Ainda está no auge da brincadeira e tem uma personalidade travessa, mas seu instinto de combate ainda não despertou.',
  stats: Object.freeze({
    hp: null,
    ds: null,
    at: null,
    de: null,
    ct: null,
    ev: null,
  }),
  evolution: Object.freeze({
    previous: '?',
    next: '?',
    note: 'Linha evolutiva indisponível: dados não confirmados para esta ficha.',
  }),
  sources: Object.freeze([
    Object.freeze({
      label: 'Digimon Reference Book',
      url: 'https://digimon.net/reference/detail.php?directory_name=tunomon',
    }),
    Object.freeze({
      label: 'Toei Animation — Digimon Adventure',
      url: 'http://www.toei-anim.co.jp/tv/dejimon/chara/tsunomon.html',
    }),
  ]),
});

export const TSUMEMON = Object.freeze({
  id: 'tsumemon',
  number: '03',
  name: 'Tsumemon',
  kana: 'ツメモン',
  level: 'In-Training',
  levelStage: 'Baby II',
  levelOriginal: '幼年期Ⅱ',
  type: 'Species Unknown',
  typeOriginal: '種族不明',
  attribute: 'None',
  attributeOriginal: 'なし',
  attack: Object.freeze({
    name: 'Nail Scratch',
    original: 'ネイルスクラッチ',
    romaji: 'Neiru Sukuracchi',
    description: 'Corta com as garras de seus tentáculos.',
  }),
  description:
    'Um Digimon bebê que evoluiu ainda mais a partir de Kuramon. As pontas de seus tentáculos assumiram a forma de garras, aumentando sua ferocidade. Consome dados em velocidade assustadora, fazendo a rede funcionar mal. Também é muito rápido, o que torna difícil capturá-lo depois que evolui para Tsumemon.',
  stats: Object.freeze({
    hp: null,
    ds: null,
    at: null,
    de: null,
    ct: null,
    ev: null,
  }),
  evolution: Object.freeze({
    previous: '?',
    next: '?',
    note: 'Linha evolutiva indisponível: dados não confirmados para esta ficha.',
  }),
  sources: Object.freeze([
    Object.freeze({
      label: 'Digimon Reference Book',
      url: 'https://digimon.net/reference/detail.php?directory_name=tsumemon',
    }),
  ]),
});

export const DIGIMONS = Object.freeze({
  koromon: KOROMON,
  tsunomon: TSUNOMON,
  tsumemon: TSUMEMON,
});
