import type { WeatherResponse } from '~/types/weather'

export type ClothingGender = 'neutral' | 'feminine' | 'masculine'
export type ClothingPiece = {
  label: string
  icon: string
}

export type ClothingRecommendation = {
  title: string
  description: string
  pieces: ClothingPiece[]
  accent: 'cool' | 'warm' | 'wet' | 'wind'
}

export function clothingRecommendation(current: WeatherResponse['current'] | undefined, gender: ClothingGender, locale = 'en'): ClothingRecommendation {
  const german = locale === 'de'
  if (!current) {
    return {
      title: german ? 'Empfehlung wird vorbereitet' : 'Preparing your recommendation',
      description: german ? 'Deine Empfehlung erscheint, sobald die aktuellen Wetterdaten geladen sind.' : 'Your recommendation will appear once conditions are loaded.',
      pieces: [
        { label: german ? 'Temperatur wird geprüft' : 'Checking temperature', icon: '🌡️' },
        { label: german ? 'Niederschlag wird geprüft' : 'Checking precipitation', icon: '🌧️' },
        { label: german ? 'Wind wird geprüft' : 'Checking wind', icon: '🌬️' }
      ],
      accent: 'cool'
    }
  }

  const isWet = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(current.weather_code) || current.precipitation > 0
  const isCold = current.apparent_temperature < 10
  const isWarm = current.apparent_temperature >= 21
  const isWindy = current.wind_speed_10m >= 25
  const fit = german
    ? gender === 'feminine' ? 'eine lockere Bluse oder einen feinen Strickpullover' : gender === 'masculine' ? 'ein Overshirt oder einen feinen Strickpullover' : 'ein leichtes Oberteil oder einen feinen Strickpullover'
    : gender === 'feminine' ? 'a relaxed blouse or fine knit' : gender === 'masculine' ? 'an overshirt or fine knit' : 'a lightweight top or fine knit'

  if (isWet) {
    return {
      title: german ? 'Regen ist wahrscheinlich' : 'Rain in the forecast',
      description: german ? `Trag ${fit} unter einer wasserdichten Schicht. Meide Wildleder oder Leder bei diesen Bedingungen.` : `Wear ${fit} under a waterproof layer, and avoid suede or leather in these conditions.`,
      pieces: [
        { label: german ? (isCold ? 'Warme wasserdichte Jacke' : 'Leichte Regenjacke') : (isCold ? 'Warm waterproof jacket' : 'Packable rain shell'), icon: '🧥' },
        { label: german ? 'Wasserfeste Schuhe' : 'Water-resistant shoes', icon: '👟' },
        { label: german ? (isCold ? 'Leichter Schal' : 'Kompakter Schirm') : (isCold ? 'Light scarf' : 'Compact umbrella'), icon: isCold ? '🧣' : '☂️' }
      ],
      accent: 'wet'
    }
  }

  if (isCold) {
    return {
      title: german ? 'Kühle Bedingungen' : 'Cold conditions',
      description: german ? `Beginne mit ${fit} und ergänze eine wärmende Schicht als Windschutz.` : `Start with ${fit} and add an insulated layer for wind protection.`,
      pieces: [
        { label: german ? 'Wärmender Mantel' : 'Insulated coat', icon: '🧥' },
        { label: german ? 'Lange Hose oder warmer Rock' : 'Long trousers or a warm skirt', icon: gender === 'feminine' ? '👗' : '👖' },
        { label: german ? (isWindy ? 'Winddichter Schal' : 'Warme Socken') : (isWindy ? 'Windproof scarf' : 'Warm socks'), icon: isWindy ? '🧣' : '🧦' }
      ],
      accent: 'cool'
    }
  }

  if (isWarm) {
    return {
      title: german ? 'Warme Bedingungen' : 'Warm conditions',
      description: german ? `Wähle ${fit} aus atmungsaktivem Stoff und nutze Sonnenschutz.` : `Choose ${fit} in breathable fabric and use sun protection.`,
      pieces: [
        { label: german ? 'Atmungsaktive Baumwolle oder Leinen' : 'Breathable cotton or linen', icon: '👕' },
        { label: german ? 'Bequeme offene Schuhe' : 'Comfortable open shoes', icon: '🩴' },
        { label: german ? 'Sonnenbrille und Sonnenschutz' : 'Sunglasses and SPF', icon: '🕶️' }
      ],
      accent: 'warm'
    }
  }

  return {
    title: german ? 'Milde Bedingungen' : 'Mild conditions',
    description: german ? `Kombiniere ${fit} mit einer leichten Schicht, die du bei steigenden Temperaturen ausziehen kannst.` : `Pair ${fit} with a light layer you can remove as temperatures rise.`,
    pieces: [
      { label: german ? (isWindy ? 'Leichte Windjacke' : 'Lässige Jacke') : (isWindy ? 'Light windbreaker' : 'Unstructured jacket'), icon: isWindy ? '🌬️' : '🧥' },
      { label: german ? 'Jeans oder bequeme Hose' : 'Jeans or relaxed trousers', icon: '👖' },
      { label: german ? 'Schlichte bequeme Schuhe' : 'Low-profile comfortable shoes', icon: '👟' }
    ],
    accent: isWindy ? 'wind' : 'cool'
  }
}
