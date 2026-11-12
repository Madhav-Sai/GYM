import SwiftUI
import WidgetKit

/*
 * myGym's Whoop widgets. The app puts a "whoop" block into the same widget.json the other widgets
 * read (lib/widgets.js whoopWidgetBlock, written by WidgetBridgePlugin), every time it syncs with
 * the server. A value Whoop did not send is missing here too and is drawn as a dash, never a 0.
 */

struct WhoopBlock: Decodable {
    let day: String?
    let syncedAt: Double?
    let recovery: Double?
    let band: String?
    let guidance: String?
    let hrv: Double?
    let rhr: Double?
    let spo2: Double?
    let skinTemp: Double?
    let strain: Double?
    let kcal: Double?
    let sleepMin: Double?
    let sleepNeedMin: Double?
    let sleepPerf: Double?
    let respRate: Double?
    let steps: Double?
    let stepGoal: Double?
    /// Who counted `steps`: "whoop", or "apple-health" when Whoop had none today (lib/steps-source.js).
    let stepsSource: String?
    let week: [Double?]?
    let strainWeek: [Double?]?
    let weekDays: [String]?
    let zoneMin: Double?
    let zoneTarget: [Double]?
    let zoneWarn: Double?
    let hrOver: Double?
}

private struct WhoopFile: Decodable { let whoop: WhoopBlock? }

extension WhoopBlock {
    /// "Apple Health" or "Whoop", for the line under the steps.
    var stepsBy: String { stepsSource == "apple-health" ? "Apple Health" : "Whoop" }
}

extension WhoopBlock {
    static func load() -> WhoopBlock? {
        guard let data = SharedSnapshot.load() else { return nil }
        return (try? JSONDecoder().decode(WhoopFile.self, from: data))?.whoop
    }
}

struct WhoopEntry: TimelineEntry {
    let date: Date
    let w: WhoopBlock?
}

struct WhoopProvider: TimelineProvider {
    func placeholder(in context: Context) -> WhoopEntry { WhoopEntry(date: Date(), w: nil) }
    func getSnapshot(in context: Context, completion: @escaping (WhoopEntry) -> Void) {
        completion(WhoopEntry(date: Date(), w: WhoopBlock.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WhoopEntry>) -> Void) {
        // The app reloads the widgets after each sync; this is only the fallback re-read.
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        completion(Timeline(entries: [WhoopEntry(date: Date(), w: WhoopBlock.load())], policy: .after(next)))
    }
}

// MARK: - looks

enum WH {
    static let green = Color(red: 0.086, green: 0.925, blue: 0.024)   // #16EC06
    static let yellow = Color(red: 1.0, green: 0.871, blue: 0.0)      // #FFDE00
    static let red = Color(red: 1.0, green: 0.0, blue: 0.149)         // #FF0026
    static let strain = Color(red: 0.0, green: 0.576, blue: 0.906)     // #0093E7
    static let sleep = Color(red: 0.482, green: 0.631, blue: 0.733)   // #7BA1BB
    static let steps = Color(red: 0.180, green: 0.902, blue: 0.659)    // #2EE6A8
    static let dim = Color(red: 0.541, green: 0.600, blue: 0.651)     // #8A99A6
    static let bg = LinearGradient(colors: [Color(red: 0.110, green: 0.145, blue: 0.169), Color(red: 0.043, green: 0.059, blue: 0.071)], startPoint: .topLeading, endPoint: .bottomTrailing)
    static let link = URL(string: "opengym://whoop")!

    static func band(_ score: Double?) -> Color {
        guard let s = score else { return .gray }
        return s >= 67 ? green : s >= 34 ? yellow : red
    }
    static func num(_ v: Double?, _ dp: Int = 0) -> String {
        guard let v = v, v.isFinite else { return "–" }
        return String(format: "%.\(dp)f", v)
    }
    static func steps(_ v: Double?) -> String {
        guard let v = v, v.isFinite else { return "–" }
        let f = NumberFormatter(); f.numberStyle = .decimal; f.maximumFractionDigits = 0
        return f.string(from: NSNumber(value: v)) ?? num(v)
    }
    static func sleep(_ m: Double?) -> String {
        guard let m = m, m.isFinite, m >= 0 else { return "–" }
        let i = Int(m.rounded())
        return "\(i / 60)h \(String(format: "%02d", i % 60))m"
    }
    static func frac(_ v: Double?, _ max: Double) -> Double? {
        guard let v = v, v.isFinite, max > 0 else { return nil }
        return Swift.max(0, Swift.min(1, v / max))
    }
    static func ago(_ ms: Double?) -> String {
        guard let ms = ms else { return "not synced" }
        let mins = Int((Date().timeIntervalSince1970 * 1000 - ms) / 60000)
        if mins < 1 { return "just now" }
        if mins < 60 { return "\(mins) min ago" }
        if mins < 1440 { return "\(mins / 60) h ago" }
        return "\(mins / 1440) d ago"
    }
}

struct WRing: View {
    let frac: Double?
    let color: Color
    let value: String
    var unit: String = ""
    var label: String? = nil
    var line: CGFloat = 7
    var font: CGFloat = 20

    var body: some View {
        VStack(spacing: 3) {
            ZStack {
                Circle().stroke(Color.white.opacity(0.08), lineWidth: line)
                if let f = frac {
                    Circle().trim(from: 0, to: f)
                        .stroke(AngularGradient(colors: [color.opacity(0.55), color], center: .center, startAngle: .degrees(0), endAngle: .degrees(360 * f)), style: StrokeStyle(lineWidth: line, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                        .shadow(color: color.opacity(0.6), radius: 4)
                }
                HStack(alignment: .firstTextBaseline, spacing: 1) {
                    Text(value).font(.system(size: font, weight: .heavy, design: .rounded)).monospacedDigit()
                        .foregroundColor(frac == nil ? WH.dim : .white)
                    if frac != nil && !unit.isEmpty { Text(unit).font(.system(size: font * 0.45, weight: .bold)).foregroundColor(color.opacity(0.85)) }
                }
                .minimumScaleFactor(0.5).lineLimit(1).padding(.horizontal, line + 2)
            }
            if let l = label { Text(l).font(.system(size: 10, weight: .semibold)).foregroundColor(WH.dim).lineLimit(1) }
        }
    }
}

struct WStat: View {
    let label: String
    let value: String
    var color: Color = .primary
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(value).font(.system(size: 15, weight: .heavy, design: .rounded)).monospacedDigit().foregroundColor(color).lineLimit(1).minimumScaleFactor(0.6)
            Text(label).font(.system(size: 9, weight: .semibold)).foregroundColor(WH.dim).lineLimit(1)
        }
    }
}

struct WBars: View {
    let values: [Double?]
    let max: Double
    let color: (Double) -> Color
    var body: some View {
        GeometryReader { g in
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(Array(values.enumerated()), id: \.offset) { _, v in
                    let h = (v.map { Swift.max(0.04, Swift.min(1, $0 / max)) } ?? 0.04) * g.size.height
                    RoundedRectangle(cornerRadius: 2).fill(v.map(color) ?? Color.gray.opacity(0.25)).frame(height: h)
                }
            }
        }
    }
}

private struct Empty: View {
    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: "heart.text.square").font(.title2).foregroundColor(WH.red)
            Text("Open myGym to sync Whoop").font(.caption2).multilineTextAlignment(.center).foregroundColor(WH.dim)
            // myGym: why (SharedSnapshot.blockNote): no data at all, or no whoop block in it.
            let note = SharedSnapshot.blockNote("whoop")
            if !note.isEmpty {
                Text(verbatim: note).font(.system(size: 8, design: .monospaced)).foregroundColor(WH.dim.opacity(0.7)).lineLimit(2)
            }
        }
    }
}

// MARK: - the Whoop widget

struct WhoopWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WhoopEntry

    var body: some View {
        Group {
            if let w = entry.w {
                switch family {
                case .systemMedium: medium(w)
                case .systemLarge: large(w)
                case .accessoryCircular: circular(w)
                case .accessoryRectangular: rect(w)
                case .accessoryInline: Text("Recovery \(WH.num(w.recovery))% · HRV \(WH.num(w.hrv))")
                default: small(w)
                }
            } else {
                if family == .accessoryCircular || family == .accessoryInline || family == .accessoryRectangular {
                    Text("–")
                } else { Empty() }
            }
        }
        .widgetURL(WH.link)
        .containerBackground(for: .widget) {
            if family == .accessoryCircular || family == .accessoryRectangular || family == .accessoryInline { Color.clear } else { WH.bg }
        }
        .environment(\.colorScheme, family == .accessoryCircular || family == .accessoryRectangular || family == .accessoryInline ? .light : .dark)
    }

    func header(_ w: WhoopBlock) -> some View {
        HStack {
            Text("WHOOP").font(.system(size: 10, weight: .black)).tracking(1.5).foregroundColor(.white)
            Spacer()
            Text(WH.ago(w.syncedAt)).font(.system(size: 9, weight: .medium)).foregroundColor(WH.dim)
        }
    }

    func small(_ w: WhoopBlock) -> some View {
        VStack(spacing: 6) {
            header(w)
            WRing(frac: WH.frac(w.recovery, 100), color: WH.band(w.recovery), value: WH.num(w.recovery), unit: "%", line: 9, font: 26)
            HStack {
                WStat(label: "HRV", value: WH.num(w.hrv))
                Spacer()
                WStat(label: "RHR", value: WH.num(w.rhr))
                Spacer()
                WStat(label: "Strain", value: WH.num(w.strain, 1), color: WH.strain)
            }
        }
    }

    func medium(_ w: WhoopBlock) -> some View {
        VStack(spacing: 8) {
            header(w)
            HStack(spacing: 10) {
                WRing(frac: WH.frac(w.recovery, 100), color: WH.band(w.recovery), value: WH.num(w.recovery), unit: "%", label: "Recovery", line: 7, font: 19)
                WRing(frac: WH.frac(w.strain, 21), color: WH.strain, value: WH.num(w.strain, 1), label: "Strain", line: 7, font: 19)
                WRing(frac: WH.frac(w.sleepPerf, 100), color: WH.sleep, value: WH.num(w.sleepPerf), unit: "%", label: "Sleep", line: 7, font: 19)
                WRing(frac: WH.frac(w.steps, w.stepGoal ?? 8000), color: WH.steps, value: WH.steps(w.steps), label: "Steps", line: 7, font: 13)
            }
            HStack {
                WStat(label: "HRV ms", value: WH.num(w.hrv))
                Spacer()
                WStat(label: "RHR bpm", value: WH.num(w.rhr))
                Spacer()
                WStat(label: "Asleep", value: WH.sleep(w.sleepMin))
                Spacer()
                WStat(label: "kcal", value: WH.steps(w.kcal))
            }
        }
    }

    func large(_ w: WhoopBlock) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            header(w)
            HStack(spacing: 12) {
                WRing(frac: WH.frac(w.recovery, 100), color: WH.band(w.recovery), value: WH.num(w.recovery), unit: "%", label: "Recovery", line: 9, font: 24)
                WRing(frac: WH.frac(w.strain, 21), color: WH.strain, value: WH.num(w.strain, 1), label: "Strain", line: 9, font: 24)
                WRing(frac: WH.frac(w.sleepPerf, 100), color: WH.sleep, value: WH.num(w.sleepPerf), unit: "%", label: "Sleep", line: 9, font: 24)
            }
            .frame(height: 96)
            if let g = w.guidance {
                Text(g).font(.system(size: 12, weight: .bold)).foregroundColor(WH.band(w.recovery)).lineLimit(2)
            }
            HStack {
                WStat(label: "HRV ms", value: WH.num(w.hrv))
                Spacer()
                WStat(label: "RHR bpm", value: WH.num(w.rhr))
                Spacer()
                WStat(label: "SpO2 %", value: WH.num(w.spo2, 1))
                Spacer()
                WStat(label: "Skin °C", value: WH.num(w.skinTemp, 1))
            }
            HStack {
                WStat(label: "Asleep", value: WH.sleep(w.sleepMin))
                Spacer()
                WStat(label: "Need", value: WH.sleep(w.sleepNeedMin))
                Spacer()
                WStat(label: "Steps", value: WH.steps(w.steps), color: WH.steps)
                Spacer()
                WStat(label: "kcal", value: WH.steps(w.kcal))
            }
            if let week = w.week, week.count > 1 {
                Text("RECOVERY · 7 DAYS").font(.system(size: 9, weight: .bold)).foregroundColor(WH.dim)
                WBars(values: week, max: 100, color: { WH.band($0) }).frame(height: 34)
            }
            if let z = w.zoneMin {
                let warn = w.zoneWarn ?? 30
                let top = Swift.max(warn, z) * 1.15
                HStack {
                    Text("ZONE 4-5").font(.system(size: 9, weight: .bold)).foregroundColor(WH.dim)
                    Spacer()
                    Text("\(WH.num(z)) / \(WH.num(w.zoneTarget?.first))-\(WH.num(w.zoneTarget?.last)) min").font(.system(size: 10, weight: .bold)).monospacedDigit()
                        .foregroundColor(z > warn ? WH.red : z > (w.zoneTarget?.last ?? 25) ? WH.yellow : WH.green)
                }
                GeometryReader { g in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.gray.opacity(0.22))
                        Capsule().fill(z > warn ? WH.red : WH.green).frame(width: g.size.width * Swift.min(1, z / top))
                        Rectangle().fill(WH.red).frame(width: 2).offset(x: g.size.width * warn / top)
                    }
                }.frame(height: 7)
            }
            if let hr = w.hrOver {
                Text("⚠︎ Heart rate hit \(WH.num(hr)) bpm, above 175").font(.system(size: 10, weight: .bold)).foregroundColor(WH.red)
            }
            Spacer(minLength: 0)
        }
    }

    func circular(_ w: WhoopBlock) -> some View {
        Gauge(value: WH.frac(w.recovery, 100) ?? 0) {
            Image(systemName: "heart.fill")
        } currentValueLabel: {
            Text(WH.num(w.recovery)).font(.system(size: 16, weight: .heavy, design: .rounded))
        }
        .gaugeStyle(.accessoryCircular)
    }

    func rect(_ w: WhoopBlock) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("Recovery \(WH.num(w.recovery))%").font(.headline).widgetAccentable()
            Text("HRV \(WH.num(w.hrv)) · RHR \(WH.num(w.rhr)) · Strain \(WH.num(w.strain, 1))").font(.caption).lineLimit(1).minimumScaleFactor(0.7)
            Text("Sleep \(WH.sleep(w.sleepMin)) · \(WH.steps(w.steps)) steps").font(.caption).lineLimit(1).minimumScaleFactor(0.7)
        }
    }
}

struct WhoopWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MyGymWhoop", provider: WhoopProvider()) { entry in
            WhoopWidgetView(entry: entry)
        }
        .configurationDisplayName("Whoop")
        .description("Recovery, strain, sleep, HRV, resting heart rate, SpO2, steps and zone 4-5 minutes.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - steps (the widget Whoop's own app does not have)

struct WhoopStepsView: View {
    @Environment(\.widgetFamily) private var family
    let entry: WhoopEntry

    var body: some View {
        let w = entry.w
        let goal = w?.stepGoal ?? 8000
        Group {
            switch family {
            case .accessoryCircular:
                Gauge(value: WH.frac(w?.steps, goal) ?? 0) { Image(systemName: "figure.walk") } currentValueLabel: {
                    Text(w?.steps.map { $0 >= 10000 ? String(format: "%.0fk", $0 / 1000) : String(format: "%.1fk", $0 / 1000) } ?? "–").font(.system(size: 13, weight: .heavy, design: .rounded))
                }.gaugeStyle(.accessoryCircular)
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(WH.steps(w?.steps)) steps").font(.headline).widgetAccentable()
                    Gauge(value: WH.frac(w?.steps, goal) ?? 0) { EmptyView() }.gaugeStyle(.accessoryLinearCapacity)
                    Text("Goal \(WH.steps(goal)) · \(w?.stepsBy ?? "Whoop")").font(.caption2)
                }
            case .accessoryInline:
                Text("\(WH.steps(w?.steps)) steps")
            default:
                VStack(spacing: 6) {
                    HStack {
                        Text("STEPS").font(.system(size: 10, weight: .black)).tracking(1.5).foregroundColor(.white)
                        Spacer()
                        Image(systemName: "figure.walk").font(.system(size: 11, weight: .bold)).foregroundColor(WH.steps)
                    }
                    WRing(frac: WH.frac(w?.steps, goal), color: WH.steps, value: WH.steps(w?.steps), line: 10, font: 20)
                    Text("of \(WH.steps(goal)) · counted by \(w?.stepsBy ?? "Whoop")").font(.system(size: 9, weight: .medium)).foregroundColor(WH.dim).lineLimit(1).minimumScaleFactor(0.7)
                }
            }
        }
        .widgetURL(WH.link)
        .containerBackground(for: .widget) {
            if family == .systemSmall { WH.bg } else { Color.clear }
        }
        .environment(\.colorScheme, family == .systemSmall ? .dark : .light)
    }
}

struct WhoopStepsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MyGymSteps", provider: WhoopProvider()) { entry in
            WhoopStepsView(entry: entry)
        }
        .configurationDisplayName("Steps")
        .description("Today's steps from Whoop, or from Apple Health when Whoop has none, against your 8,000 goal.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}
