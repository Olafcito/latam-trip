// Dev only: the worst realistic data, swapped in at the loader by adding ?data=worst to the URL. load.ts reaches it
// through a dynamic import behind import.meta.env.DEV, so a production build never holds this file.
//   ?data=worst  the real data with the awkward rows in front of it
//   ?data=empty  no experiences and no saved lists at all
//   ?data=one    one gym, one city, one experience, one saved place
//   ?data=huge   1,200 gyms, for the list and the map
import type { CityRow, Experience, GymRow, MapData, Place, SavedList } from './types'

export const WORST_MARKER = 'worst-case-fixture'

const LONG_NAME = 'Academia de Artes Marciales Mixtas y Muay Thai Hermanos Rodríguez-Castañeda de la Santísima Trinidad (Ciudad de México)'
const LONG_AREA = 'Colonia Santa María de la Ribera, Alcaldía Cuauhtémoc, Ciudad de México, a dos cuadras del metro Buenavista, entrada por el callejón'
const NO_BREAK = 'Gimnasiodeboxeoyartesmarcialesmixtashermanosrodriguezcastanedadelasantisimatrinidaddelacolonia'
const NO_BREAK_URL = 'https://www.instagram.com/stories/highlights/academia_de_artes_marciales_mixtas_hermanos_rodriguez_castaneda_oficial_cdmx/17982345678901234'
const PARAGRAPH =
  'Reviewers say the head coach came up through the Lumpinee circuit and still holds pads himself, and that the Saturday sparring is hard but looked after, with about 40 people on a good morning. ' +
  'Two reviews from last month mention a new ring, one mentions that the showers stopped working in the dry season, and the owner answers messages within a day in Spanish and in English.'
const SCRIPT_TEXT = 'Clases de <b>boxeo</b> & **kickboxing**, 2 > 1, A&amp;B, "comillas" y 100% sudor'
const QUOTE = { quote: PARAGRAPH, site: 'Google Maps review by Aleksandra Wiśniewska-Kowalczyk', date: '2026-10-29', url: NO_BREAK_URL }

const SOME_GYM = (id: string, at: Pick<Place, 'lat' | 'lon' | 'id'> | null, over: Partial<GymRow>): GymRow => ({
  id,
  name: id,
  category: 'training',
  tags: ['gym'],
  area: null,
  country: 'MX',
  lat: at?.lat ?? 17.25,
  lon: at?.lon ?? -88.77,
  summary: null,
  price: null,
  price_dkk: null,
  places: at ? [at.id] : [],
  ...over,
})

const SCORE_TEN = { training: 10, evidence: 10, local_life: 10, cost: 10, water: 10, total: 10 }

function gyms(a: Place, b: Place, photo: Place['image']): GymRow[] {
  return [
    SOME_GYM('worst-gym-all', a, {
      name: LONG_NAME,
      area: LONG_AREA,
      tags: ['gym', 'muay-thai', 'kickboxing', 'boxing', 'mma', 'bjj'],
      summary: PARAGRAPH,
      price: 'Wellhub Gold plan MXN 999.90 per month (aggregator price, not the gym), plus a registration fee of MXN 1,500 and a yearly insurance of MXN 2,200 paid to the federation',
      price_dkk: 1284503,
      duration: 'Monthly membership with a three month minimum, cancelled in writing at the front desk',
      season: 'Year round except the two weeks around Semana Santa',
      dec_jan: 'Closed 24 Dec to 2 Jan, reopens with a reduced timetable until the fight card on 18 Jan',
      requirements: 'Own gloves, shin guards, mouthguard and groin guard, a medical certificate from a Mexican doctor, and a signed waiver',
      image: photo,
      image_source: 'own',
      sources: [NO_BREAK_URL, NO_BREAK_URL, 'https://www.tapology.com/gyms/1234-hermanos-rodriguez', 'https://www.sherdog.com/gym', 'https://gymnavigator.com/gyms/mexico/', 'not a url at all', 'https://facebook.com/a', 'https://facebook.com/b'],
      details: {
        gym_kind: 'mixed martial arts and striking academy with an affiliated amateur boxing club',
        disciplines: ['MMA', 'kickboxing', 'Muay Thai', 'BJJ', 'boxing', 'boxing'],
        coaches: 'Fernando Carrillo, Bartholomew Fitzgerald-Montgomery III, Aleksandra Wiśniewska-Kowalczyk and Jo',
        fighters: PARAGRAPH,
        sessions_per_week: 36,
        timetable: 'Mon 5:30-6:30 12:00-13:00 15:00-20:15; Tue 15:00-20:15; Wed 5:30-6:30 12:00-13:00 15:00-20:15; Thu 15:00-20:15; Fri 5:30-6:30 12:00-13:00 15:00-20:15; Sat 9:00-13:00; Sun closed',
        sparring: PARAGRAPH,
        visitors: PARAGRAPH,
        price_dropin_dkk: 1284503,
        price_week_dkk: 12845030,
        price_month_dkk: 128450300,
        private_dkk: 1284503000,
        google_rating: 4.9,
        google_reviews: 128450,
        other_ratings: [
          { site: 'Gym Navigator', rating: 4.9, count: 29 },
          { site: 'Gym Navigator', rating: 4.1, count: 1 },
          { site: 'Yelp', rating: null, count: 12 },
          { site: 'TripAdvisor', rating: 3, count: null },
          { site: 'Nothing here', rating: null, count: null },
          { site: 'A review site with a name that goes on for a good while longer than the others', rating: 2.5, count: 1284503 },
        ],
        last_activity: 'about 2024 Google review (newest of the three shown). Site is an app shell, so nothing newer could be read from it.',
        what_people_say: [QUOTE, QUOTE, { quote: 'Short.', site: null, date: null, url: null }, { quote: 'Sin enlace.', site: 'Facebook', date: null, url: null }, { quote: 'Sin sitio.', site: null, date: '2024-01', url: 'https://example.com/a' }],
        neighbourhood: PARAGRAPH,
        room_month_dkk: 128450,
        studio_month_dkk: 1284503,
        food_day_dkk: 12845,
        water_km: 3120,
        water_note: PARAGRAPH,
        score: SCORE_TEN,
        score_note: PARAGRAPH,
        website: NO_BREAK_URL,
        instagram: NO_BREAK_URL,
        facebook: NO_BREAK_URL,
        phone: '+52 55 1234 5678 ext. 90123',
        google_maps_url: NO_BREAK_URL,
        address: LONG_AREA,
        address_note: PARAGRAPH,
        hours: 'Mon to Fri 5:30-22:00; Sat 8:00-14:00; Sun closed',
      },
    }),
    SOME_GYM('worst-gym-null', a, { name: 'Jo', details: null, sources: undefined }),
    SOME_GYM('worst-gym-empty', a, {
      name: 'Gym whose every value is empty',
      area: '',
      summary: '',
      price: '',
      duration: '',
      season: '',
      dec_jan: '',
      requirements: '',
      tags: ['gym'],
      sources: [],
      details: { gym_kind: '', disciplines: [], other_ratings: [], what_people_say: [], score: { training: null, evidence: null, local_life: null, cost: null, water: null, total: null }, sparring: '  ' },
    }),
    SOME_GYM('worst-gym-nobreak', b, {
      name: NO_BREAK,
      area: NO_BREAK,
      summary: NO_BREAK_URL,
      tags: ['gym', 'boxing'],
      sources: [NO_BREAK_URL],
      details: {
        gym_kind: NO_BREAK,
        coaches: NO_BREAK,
        address: NO_BREAK_URL,
        last_activity: NO_BREAK_URL,
        score: { training: 7, evidence: 7, local_life: 7, cost: 7, water: 7, total: 7 },
        score_note: NO_BREAK_URL,
        what_people_say: [{ quote: NO_BREAK_URL, site: NO_BREAK, date: null, url: NO_BREAK_URL }],
        other_ratings: [{ site: NO_BREAK, rating: 4.2, count: 8 }],
      },
      price: NO_BREAK_URL,
    }),
    SOME_GYM('worst-gym-thai', b, {
      name: 'ค่ายมวยไทยศิษย์ป้าเหลียงเกียรติเพชรกรุงเทพมหานครสาขาเม็กซิโกซิตี้',
      area: 'กรุงเทพมหานคร ซอยสุขุมวิท ๑๐๑',
      country: 'MX',
      tags: ['gym', 'muay-thai'],
      summary: 'ค่ายมวยไทยแบบดั้งเดิม เปิดสอนทุกวัน ฝึกกับนักมวยอาชีพ',
      details: { score: { training: 6.25, evidence: 3.33, local_life: 1.67, cost: 0.5, water: 2.5, total: 3.33333333 }, gym_kind: 'ค่ายมวย', google_rating: 1, google_reviews: 1 },
    }),
    SOME_GYM('worst-gym-mixed', b, {
      name: '合気道道場 東京都渋谷区 مركز الفنون القتالية Phòng tập Võ thuật Nguyễn Thị Hồng Nhung 🥊🇲🇽',
      area: 'الدار البيضاء 渋谷区',
      tags: ['gym', 'bjj'],
      summary: SCRIPT_TEXT,
      details: { gym_kind: SCRIPT_TEXT, score: { training: 0, evidence: 0, local_life: 0, cost: 0, water: 0, total: 0 }, google_reviews: 0, sessions_per_week: 'Twice a day except on fight weeks, when it is whatever the head coach decides that morning' },
    }),
    SOME_GYM('worst-gym-parts', b, {
      name: 'Score with parts and no total',
      tags: ['gym', 'mma'],
      details: { score: { training: 9.5, evidence: null, local_life: 3, cost: null, water: null, total: null } },
    }),
    SOME_GYM('worst-gym-total', b, {
      name: 'Score with a total and no parts',
      tags: ['gym', 'kickboxing'],
      price_dkk: 0,
      details: { score: { training: null, evidence: null, local_life: null, cost: null, water: null, total: 9.87 }, price_month_dkk: 0, private_dkk: 0 },
    }),
    SOME_GYM('worst-gym-belize', null, {
      name: 'The one gym in Belize',
      area: 'Belmopan',
      country: 'BZ',
      tags: ['gym', 'boxing'],
      details: { score: { training: 4, evidence: 4, local_life: 4, cost: 4, water: 4, total: 4 } },
    }),
  ]
}

const SOME_CITY = (id: string, at: Pick<Place, 'lat' | 'lon' | 'id'>, over: Partial<CityRow>): CityRow => ({
  id,
  name: `${id}: training base scorecard`,
  category: 'training',
  tags: ['city-scorecard'],
  area: id,
  country: 'MX',
  lat: at.lat,
  lon: at.lon,
  summary: null,
  price: null,
  price_dkk: null,
  places: [at.id],
  ...over,
})

function cities(a: Place, b: Place, c: Place, photo: Place['image']): CityRow[] {
  return [
    SOME_CITY('worst-city-all', a, {
      area: 'San Cristóbal de las Casas y los Altos de Chiapas, Municipio Autónomo',
      summary: PARAGRAPH,
      image: photo,
      image_source: 'place',
      sources: [NO_BREAK_URL, NO_BREAK_URL],
      details: {
        gyms: ['worst-gym-all', 'worst-gym-null', 'worst-gym-empty'],
        best_gym: 'worst-gym-all',
        monthly_total_dkk: 1284503,
        monthly_note: PARAGRAPH,
        price_note: PARAGRAPH,
        cost_note: PARAGRAPH,
        room_month_dkk: 128450,
        studio_month_dkk: 1284503,
        food_day_dkk: 12845,
        neighbourhoods: PARAGRAPH,
        safety: PARAGRAPH,
        local_life: PARAGRAPH,
        water_note: PARAGRAPH,
        also_seen: PARAGRAPH,
        unverified: PARAGRAPH,
        what_people_say: [QUOTE],
        score: SCORE_TEN,
        numbeo: {
          numbeo_url: NO_BREAK_URL,
          proxy_for: 'San Cristóbal de las Casas y los Altos de Chiapas, Municipio Autónomo',
          col_index: 142.9,
          rent_index: 121.7,
          col_plus_rent_index: 133,
          single_month_no_rent_dkk: 1284503,
          rent_1bed_outside_dkk: 12845030,
          meal_cheap_dkk: 12845,
          gym_month_dkk: 12845,
          monthly_total_dkk: 128450300,
          contributors_note: 'Very low sample and stale: 5 contributors in 18 months, last update 30 Apr 2025, gym empty. Meal of 4.24 USD looks too low. single_month_no_rent from Managua (no estimate on own page)',
        },
        hostels: { dorm_night_dkk: 12845, private_night_dkk: 128450, n: 42, names: ['La Zona Hostel', NO_BREAK, 'Hostal Cumbres del Volcan Flor Blanca'], source: PARAGRAPH },
        indices: {
          backpacker_index_dkk_day: 12845.87,
          backpacker_index_year: 2025,
          backpacker_index_url: 'https://example.com/b',
          backpacker_index_note: PARAGRAPH,
          expat_friendliness_rank: 53,
          expat_settling_rank: 1,
          expat_edition: 2026,
          expat_url: 'https://example.com/e',
          tasteatlas_cuisine_rank: 11,
          tasteatlas_cuisine_score: 4.46,
          tasteatlas_city_rank: 131,
          tasteatlas_url: 'https://example.com/t',
        },
      },
    }),
    SOME_CITY('worst-city-null', b, { area: null, name: 'Tepoztlán', details: null, sources: undefined, image: null }),
    SOME_CITY('worst-city-hollow', b, {
      area: 'Hostels and Numbeo with nothing inside',
      image: { url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/No_such_file_here.jpg/1280px-No_such_file_here.jpg', credit: '', w: 1280, h: 720 },
      image_source: 'place',
      details: { hostels: { n: 0, names: [] }, numbeo: {}, indices: {}, what_people_say: [], gyms: [], score: { training: null, evidence: null, local_life: null, cost: null, water: null, total: null } },
    }),
    SOME_CITY('worst-city-nobreak', c, {
      area: NO_BREAK,
      summary: NO_BREAK_URL,
      details: { gyms: ['worst-gym-nobreak', 'worst-gym-thai', 'worst-gym-mixed', 'worst-gym-parts', 'worst-gym-total'], best_gym: 'worst-gym-nobreak', score: { training: 2, evidence: 2, local_life: null, cost: null, water: 2, total: null }, numbeo: { monthly_total_dkk: 0, contributors_note: NO_BREAK_URL }, hostels: { names: [NO_BREAK] }, safety: NO_BREAK_URL },
    }),
    SOME_CITY('worst-city-thai', c, {
      area: 'เมืองเชียงใหม่ جوهانسبرغ 渋谷区',
      summary: 'ค่ายมวยไทยแบบดั้งเดิม 东京都',
      image: { url: photo?.url ?? '', credit: 'A photographer with a very long name that keeps on going, Wiśniewska-Kowalczyk', w: 600, h: 2400 },
      image_source: 'place',
      details: { score: { training: 1, evidence: 1, local_life: 1, cost: 1, water: 1, total: 1 } },
    }),
  ]
}

const SOME_EXP = (id: string, at: Pick<Place, 'id' | 'lat' | 'lon'> | null, over: Partial<Experience>): Experience => ({
  id,
  name: id,
  category: 'diving',
  tags: [],
  area: null,
  country: 'MX',
  lat: at?.lat ?? null,
  lon: at?.lon ?? null,
  summary: null,
  price: null,
  price_dkk: null,
  places: at ? [at.id] : [],
  researched: true,
  ...over,
})

function experiences(a: Place, b: Place, photo: Place['image']): Experience[] {
  return [
    SOME_EXP('worst-exp-all', a, {
      name: 'Two-day guided trek to the Sima de las Cotorras cenotes with a night in the Selva El Ocote, including the river crossing, the bat cave and the descent to the waterfall',
      area: LONG_AREA,
      summary: PARAGRAPH,
      tags: ['sharks', 'night-dive', 'a-tag-that-is-rather-long-for-a-tag', 'open-water', 'advanced', 'liveaboard', 'whale-sharks'],
      price: 'Two-tank trip from US$155 incl. gear, reserve fee, lunch, a guide, a porter and a shuttle from the hostel at 05:30',
      price_dkk: 1284503,
      duration: '2 days, 1 night',
      season: 'Dec to Jun',
      dec_jan: 'Good: water 24 to 29°C, visibility up to 30 m',
      requirements: 'Open Water and 25 logged dives',
      image: photo,
      image_source: 'own',
      sources: [NO_BREAK_URL, NO_BREAK_URL],
      details: { water: 'Pacific', animals: PARAGRAPH, cert: 'Open Water', depth: 'Mostly within Open Water range', hostelworld: NO_BREAK_URL, how_to_get_there: PARAGRAPH, logged_dives_min: 25, extras: ['Fuego guide', 'Porter'], nested: { a: 1 }, empty: '', nothing: null, duplicate_url: NO_BREAK_URL },
    }),
    SOME_EXP('worst-exp-null', a, { name: 'X', tags: undefined as unknown as string[], details: null, sources: undefined, image: null, researched: false }),
    SOME_EXP('worst-exp-unknown', a, { name: 'A category nobody has heard of', category: 'unheard-of-category', researched: false }),
    SOME_EXP('worst-exp-nobreak', b, { name: NO_BREAK, area: NO_BREAK, summary: NO_BREAK_URL, price: NO_BREAK_URL, tags: [NO_BREAK], details: { note: NO_BREAK_URL }, sources: [NO_BREAK_URL] }),
    SOME_EXP('worst-exp-thai', b, { name: 'ดำน้ำดูฉลามวาฬที่หมู่เกาะสิมิลัน 東京都 جوهانسبرغ', area: 'กรุงเทพมหานคร', summary: 'ค่ายมวยไทยแบบดั้งเดิม', details: { note: SCRIPT_TEXT } }),
    SOME_EXP('worst-exp-nowhere', null, { name: 'No place and no point on the map', country: 'EC', area: null }),
  ]
}

const LONG_NOTE = 'Simon wants to spend New Year here if the Treehouse is full, ask Karina about the shuttle, and check the swell forecast at least two weeks ahead because the road floods after rain and the last bus leaves at noon.'

function savedLists(a: Place, b: Place): SavedList[] {
  return [
    {
      id: 'want',
      name: 'Want to check out',
      items: [
        { type: 'place', id: a.id, note: LONG_NOTE },
        { type: 'place', id: b.id, note: null },
        { type: 'experience', id: 'worst-exp-all', note: LONG_NOTE },
        { type: 'experience', id: 'worst-exp-null', note: NO_BREAK_URL },
        { type: 'experience', id: 'worst-exp-nowhere', note: '' },
        { type: 'experience', id: 'worst-exp-gone', note: 'A saved row whose experience was deleted' },
        { type: 'place', id: 'NOPE', note: 'A saved place that no longer exists' },
      ],
    },
  ]
}

/** The swap the loader makes, given the value of the `data` URL parameter. An unknown value leaves the data alone. */
export function worstCase(data: MapData, which: string): MapData {
  const rows = data.experiences ?? []
  const spots = data.places.filter((p) => !p.context)
  const [a, b, c] = [spots[0], spots[Math.floor(spots.length / 2)], spots[spots.length - 1]]
  const photo = rows.find((r) => r.image?.url && r.image_source === 'own')?.image ?? null
  if (which === 'empty') return { ...data, experiences: [], categories: [], lists: [] }
  if (which === 'one') {
    const gym = rows.find((r) => r.tags?.includes('gym'))
    const city = rows.find((r) => r.tags?.includes('city-scorecard'))
    const plain = rows.find((r) => !r.tags?.includes('gym') && !r.tags?.includes('city-scorecard'))
    const one = [gym, city, plain].filter((r): r is Experience => !!r)
    return { ...data, experiences: one, lists: [{ id: 'want', name: 'Want to check out', items: [{ type: 'place', id: a.id, note: 'One saved place' }] }] }
  }
  if (which === 'huge') {
    const gymRows = rows.filter((r) => r.tags?.includes('gym'))
    const many = Array.from({ length: 1200 }, (_, i) => {
      const g = gymRows[i % gymRows.length]
      return { ...g, id: `${g.id}-${i}`, name: `${g.name} ${i + 1}`, lat: (g.lat ?? 0) + (i % 40) * 0.02, lon: (g.lon ?? 0) + (i % 30) * 0.02 }
    })
    return { ...data, experiences: [...many, ...rows.filter((r) => !r.tags?.includes('gym'))] }
  }
  if (which !== 'worst') return data
  const extra = [...gyms(a, b, photo), ...cities(a, b, c, photo), ...experiences(a, b, photo)] as Experience[]
  return { ...data, experiences: [...extra, ...rows], lists: savedLists(a, b) }
}
