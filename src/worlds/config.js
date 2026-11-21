const background = (filename) =>
  `${import.meta.env.BASE_URL}assets/backgrounds/worlds/${filename}`

const futureWorld = (id, name, filename, palette) => ({
  id,
  name,
  background: background(filename),
  palette,
  fog: null,
  lighting: null,
  environment: null,
  obstacles: [],
  collectibles: [],
  difficulty: null,
  music: null,
  specialEffects: [],
})

export const worlds = [
  {
    ...futureWorld('01', 'Frozen Kingdom', 'world-01-frozen-kingdom.webp', {
      sky: '#8ac5e9',
      snow: '#e5f7ff',
      ice: '#8fc8e3',
      forest: '#315b71',
    }),
    fog: { color: '#abcddd', near: 100, far: 190 },
    lighting: { ambient: '#d9f4ff', sun: '#f5fbff' },
    environment: 'frozen-kingdom',
    obstacles: ['iceBlock', 'snowBarrier', 'fallenPine'],
    collectibles: ['crystal'],
    specialEffects: ['snow'],
  },
  futureWorld('02', 'Whispering Ice Forest', 'world-02-whispering-ice-forest.webp', {
    sky: '#8abfce', snow: '#edfaff', ice: '#8ccbd6', forest: '#315c60',
  }),
  futureWorld('03', 'Crystal Mountains', 'world-03-crystal-mountains.webp', {
    sky: '#9daeda', snow: '#f0f8ff', ice: '#b0ddf5', forest: '#536985',
  }),
  futureWorld('04', 'Frozen Ocean', 'world-04-frozen-ocean.webp', {
    sky: '#7cb5d3', snow: '#e6f7ff', ice: '#8ad4e4', forest: '#35667b',
  }),
  futureWorld('05', 'Frosted Dream Desert', 'world-05-frosted-dream-desert.webp', {
    sky: '#ddb9d0', snow: '#fff3f1', ice: '#e6c6d6', forest: '#927b96',
  }),
  futureWorld('06', 'Sky of Aurora', 'world-06-sky-of-aurora.webp', {
    sky: '#887dcc', snow: '#f2f4ff', ice: '#b5e3ef', forest: '#535d8e',
  }),
  futureWorld('07', 'Celestial Ice Palace', 'world-07-celestial-ice-palace.webp', {
    sky: '#8198cf', snow: '#f4f9ff', ice: '#c4e7fa', forest: '#5d6e9a',
  }),
]

