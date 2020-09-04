const { Readable, Writable, Transform } = require('stream')
const Diffy = require('diffy')
const trim = require('diffy/trim')

/*
 * Stream of random letters will go into a transform
 * The transform will emit words to a word processor
 * The processor will update a simple state that consists of
 * a word's frequency so far. The state will be graphed
 * visually in the terminal, along with the original stream
 * of letters.
 *
 * Since the letter stream is unending, they will be collected
 * into a sliding window to be displayed.
 *
 */

function randomLetters (freq) {
  const pool = 'abcdefghijklmnopqrstuvwxyz '.split('')
  const stream = new Readable({
    encoding: 'utf-8',
    read() {}
  })

  setInterval(() => {
    stream.push(pool[Math.floor(Math.random() * pool.length)])
  }, freq)

  return stream
}

function lettersToWords () {
  let word = ''
  return new Transform({
    encoding: 'utf-8',
    decodeStrings: false,
    transform (ltr, _, done) {
      if (ltr === ' ') {
        done(null, word)
        word = ''
      } else {
        word += ltr
        done()
      }
    }
  })
}

function buildStats (wordOccurrences) {
  const allOccurs = [...wordOccurrences.values()].reduce((sum, freq) => sum + freq, 0)
  const entries = [...wordOccurrences.entries()]
    .map(([word, count]) => ({ word, freq: count / allOccurs }))

  entries.sort((a, b) => b.freq - a.freq)

  return entries.slice(0, Math.floor(process.stdout.rows * 3/4))
    .map(({ word, freq }, idx) => {
      let shortWord = word.length < 10 ? word : `${word.slice(0, 10)}...`
      while (shortWord.length < 13) shortWord += ' '
      let rank = `${idx + 1}. `
      while (rank.length < 4) rank += ' '
      return `${rank}${shortWord} => ${freq}`
    })
    .join('\n')
}

function line () {
  return '-'.repeat(process.stdout.columns)
}

async function main () {
  const diffy = Diffy({ fullscreen: true })

  const letters = randomLetters(0)
  const words = letters.pipe(lettersToWords())

  // buffer a couple letters to display a sliding window
  const buffer = []
  let lettersSoFar = 0
  letters.on('data', (letter) => {
    if (buffer.length >= process.stdout.columns - 1) {
      buffer.shift()
    }
    buffer.push(letter)
    lettersSoFar++
  })

  const wordOccurrences = new Map()
  let wordsSoFar = 0
  words.on('data', (word) => {
    wordOccurrences.set(
      word,
      (wordOccurrences.get(word) || 0) + 1
    )
    wordsSoFar++
    diffy.render()
  })

  diffy.render(() => trim(`
    ${buffer.join('')}
    ${line()}
    ${buildStats(wordOccurrences)}
    ${line()}
    Letters: ${lettersSoFar} Words: ${wordsSoFar}
  `))

}

main()

