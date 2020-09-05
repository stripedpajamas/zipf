const { Readable, Writable, Transform, pipeline } = require('stream')
const fs = require('fs')
const Diffy = require('diffy')

function randomLetters () {
  // const pool = 'abcdefghijklmnopqrstuvwxyz '.split('').map(x => x.charCodeAt(0))
  //
  // it's easier to see zipf with smaller alphabets
  // and it's much easier to see zipf if you don't have to keep
  // an unending list of gargantuan words in a map; so here we will
  // make the alphabet small, and below we will make the words have
  // a length limit
  const pool = 'abc '.split('').map(x => x.charCodeAt(0))

  return new Transform({
    encoding: 'utf-8',
    transform (chunk, _, done) {
      const ltrs = chunk.map(b => pool[b % pool.length])
      done(null, ltrs)
    }
  })
}

function lettersToWords () {
  const stream = new Transform({
    encoding: 'utf-8'
  })

  stream._transform = function (chunk, _, done) {
    let word = []
    for (const ch of chunk) {
      if (ch === 32 || word.length > 6) {
        if (word.length) { this.push(word.join('')) }
        word = []
      } else {
        word.push(String.fromCharCode(ch))
      }
    }
    done()
  }

  return stream
}

function abbreviate (word) {
  let shortWord = word.length < 10 ? word : `${word.slice(0, 10)}...`
  while (shortWord.length < 13) shortWord += ' '
  return shortWord
}

function refreshStats (wordOccurrences, allOccurs) {
  const scale = Scale(0, 1, 0, process.stdout.columns)
  const entries = [...wordOccurrences.entries()]
    .map(([word, count]) => ({
      label: abbreviate(word),
      value: scale(count / allOccurs),
      percent: `${((count / allOccurs) * 100).toFixed(2)}%`
    }))

  const data = entries.slice(0, Math.floor(process.stdout.rows * 3/4))
  data.sort((a, b) => b.value - a.value)
  return data.map(({ label, value, percent }) => `${label} ${value < 1 ? '.' : '*'.repeat(value)} ${percent}`).join('\n')
}

function buildStats (wordOccurrences, allOccurs) {
  let chart = refreshStats(wordOccurrences, allOccurs)

  let calls = 0
  return (updatedWordOccurrences, updatedAllOccurs) => {
    return refreshStats(updatedWordOccurrences, updatedAllOccurs)

    // if debouncing is needed
    if (calls % 100 === 0) {
      chart = refreshStats(updatedWordOccurrences, updatedAllOccurs)
    }
    calls++
    return chart
  }
}

function line () {
  return '-'.repeat(process.stdout.columns)
}

function Scale (rmin, rmax, tmin, tmax) {
  return (m) => {
    if (m < rmin || m > rmax) throw new Error('measurement is outside allowable range')
    return (((m - rmin) / (rmax - rmin)) * (tmax - tmin)) + tmin
  }
}

async function main () {
  const diffy = Diffy({ fullscreen: true })

  const letters = randomLetters()
  const words = lettersToWords()
  pipeline(
    fs.createReadStream('/dev/random'),
    letters,
    words,
    (err) => {
      console.error(err)
    }
  )

  // buffer a couple letters to display a sliding window
  let buffer = []
  let lettersSoFar = 0
  letters.on('data', (lettersChunk) => {
    // letters are coming in so fast it's not really even
    // feasible to display a sliding window... instead just
    // make it look interesting by displaying a bit of
    // the most recent chunk
    buffer = lettersChunk.slice(0, process.stdout.columns)
    lettersSoFar += lettersChunk.length
  })

  const wordOccurrences = new Map()
  let wordsSoFar = 0
  words.on('data', (word) => {
    wordOccurrences.set(
      word,
      (wordOccurrences.get(word) || 0) + 1
    )
    wordsSoFar++
  })

  const getStats = buildStats(wordOccurrences, wordsSoFar)

  diffy.render(() => `
${buffer}
${line()}
${getStats(wordOccurrences, wordsSoFar)}
${line()}
Letters: ${lettersSoFar} Words: ${wordsSoFar} Unique Words: ${wordOccurrences.size}`)

  setInterval(() => diffy.render(), 100)
}

main()

