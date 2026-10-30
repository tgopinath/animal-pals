// judge classify <file> <label,label,...>  -> JSON: per-window confidence for the expected labels + top label
// judge export <file> <start> <dur> <out.caf> -> trimmed, peak-normalised, mono, with short fades
import Foundation
import SoundAnalysis
import AVFoundation

final class Obs: NSObject, SNResultsObserving {
  var windows: [[String: Any]] = []
  let want: Set<String>
  init(_ w: Set<String>) { want = w }
  func request(_ request: SNRequest, didProduce result: SNResult) {
    guard let r = result as? SNClassificationResult else { return }
    let t = r.timeRange.start.seconds
    let best = r.classifications.filter { want.contains($0.identifier) }.map { $0.confidence }.max() ?? 0
    let top = r.classifications.prefix(3).map { "\($0.identifier):\(String(format: "%.2f", $0.confidence))" }
    windows.append(["t": t, "s": best, "top": top])
  }
}

let a = CommandLine.arguments
if a[1] == "classify" {
  let url = URL(fileURLWithPath: a[2])
  let want = Set(a[3].split(separator: ",").map(String.init))
  do {
    let an = try SNAudioFileAnalyzer(url: url)
    let req = try SNClassifySoundRequest(classifierIdentifier: .version1)
    req.windowDuration = CMTime(seconds: 1.5, preferredTimescale: 1000)
    req.overlapFactor = 0.5
    let o = Obs(want)
    try an.add(req, withObserver: o)
    an.analyze()
    let d = try JSONSerialization.data(withJSONObject: ["windows": o.windows])
    print(String(data: d, encoding: .utf8)!)
  } catch { print("{\"error\":\"\(error)\"}") }
} else if a[1] == "export" {
  let inF = try AVAudioFile(forReading: URL(fileURLWithPath: a[2]))
  let sr = inF.processingFormat.sampleRate
  let start = AVAudioFramePosition(Double(a[3])! * sr)
  let count = AVAudioFrameCount(min(Double(a[4])! * sr, Double(inF.length - start)))
  inF.framePosition = start
  let buf = AVAudioPCMBuffer(pcmFormat: inF.processingFormat, frameCapacity: count)!
  try inF.read(into: buf, frameCount: count)
  let n = Int(buf.frameLength), chs = Int(buf.format.channelCount)
  var mono = [Float](repeating: 0, count: n)
  for c in 0..<chs { let p = buf.floatChannelData![c]; for i in 0..<n { mono[i] += p[i] / Float(chs) } }
  var peak: Float = 1e-6; for v in mono { peak = max(peak, abs(v)) }
  let g = 0.89 / peak
  let fade = min(Int(sr * 0.08), n / 4)
  for i in 0..<n {
    var f: Float = 1
    if i < fade { f = Float(i) / Float(fade) }
    if i > n - fade { f = Float(n - i) / Float(fade) }
    mono[i] *= g * f
  }
  let fmt = AVAudioFormat(standardFormatWithSampleRate: sr, channels: 1)!
  let out = AVAudioPCMBuffer(pcmFormat: fmt, frameCapacity: AVAudioFrameCount(n))!
  out.frameLength = AVAudioFrameCount(n)
  for i in 0..<n { out.floatChannelData![0][i] = mono[i] }
  let of = try AVAudioFile(forWriting: URL(fileURLWithPath: a[5]), settings: fmt.settings)
  try of.write(from: out)
  print("ok")
}
