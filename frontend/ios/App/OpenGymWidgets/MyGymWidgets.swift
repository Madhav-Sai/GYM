import AppIntents
import SwiftUI
import WidgetKit

/*
 * myGym's health widgets: Macros, Supplements, My day, a configurable Whoop metric and the Whoop
 * week. They read the same widget.json as the others (SharedSnapshot.load(), written by
 * WidgetBridgePlugin from lib/widgets.js): the `diet`, `supps` and `day` blocks and the `whoop`
 * block's week arrays. A number the app did not send is drawn as a dash, never a 0, and a widget
 * with nothing to show says "Open myGym". Looks: the Whoop palette (WH, WRing, WStat, WBars in
 * WhoopWidgets.swift). Registered through MyGymWidgetBundle (OpenGymWidgets.swift), added to the
 * target by ios/ci/add-mygym-widgets.rb.
 */

// MARK: - the snapshot blocks (lib/widgets.js dietWidgetBlock, supplementsWidgetBlock, dayWidgetBlock)

struct MGDiet: Decodable {
    var day: String?
    var dayType: String?
    var kcal: Double?
    var kcalTarget: Double?
    var protein: Double?
    var proteinTarget: Double?
    var proteinLeft: Double?
    var fiber: Double?
    var fiberTarget: Double?
    var water: Double?
    var waterTarget: Double?
    var waterMax: Double?
}

struct MGSupp: Decodable {
    var id: String?
    var name: String?
    var time: String?
    var dose: String?
    var taken: Bool?
    var skipped: Bool?
    var d3: Bool?
}

struct MGNextSupp: Decodable {
    var name: String?
    var time: String?
    var overdue: Bool?
    /// The item's id when the widget picked it from `items` (the Taken button needs it).
    var id: String? = nil
}

struct MGSupps: Decodable {
    var day: String?
    var items: [MGSupp]?
    var total: Double?
    var pending: Double?
    var next: MGNextSupp?
    var d3Due: Bool?
    var d3Taken: Bool?
}

struct MGRow: Decodable {
    var time: String
    var label: String
}

struct MGLift: Decodable {
    var name: String?
    var line: String?
}

struct MGWorkout: Decodable {
    var name: String?
    var count: Double?
    var done: Bool?
    var lifts: [MGLift]?
}

struct MGDay: Decodable {
    var schedule: [MGRow]?
    var workout: MGWorkout?
}

/// The Whoop block's week arrays the configurable metric draws (lib/widgets.js whoopWidgetBlock).
struct MGWhoopWeeks: Decodable {
    var hrvWeek: [Double?]?
    var rhrWeek: [Double?]?
    var sleepWeek: [Double?]?
    var stepsWeek: [Double?]?
    var spo2Week: [Double?]?
}

/// Each block decoded on its own: one the app shaped differently leaves only that one empty.
struct MGFile: Decodable {
    var diet: MGDiet?
    var supps: MGSupps?
    var day: MGDay?
    var whoop: WhoopBlock?
    var weeks: MGWhoopWeeks?

    enum CodingKeys: String, CodingKey { case diet, supps, day, whoop }

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        diet = try? c.decodeIfPresent(MGDiet.self, forKey: .diet)
        supps = try? c.decodeIfPresent(MGSupps.self, forKey: .supps)
        day = try? c.decodeIfPresent(MGDay.self, forKey: .day)
        whoop = try? c.decodeIfPresent(WhoopBlock.self, forKey: .whoop)
        weeks = try? c.decodeIfPresent(MGWhoopWeeks.self, forKey: .whoop)
    }

    static func load() -> MGFile {
        guard let data = SharedSnapshot.load(), let f = try? JSONDecoder().decode(MGFile.self, from: data) else { return MGFile() }
        return f
    }
}

struct MGEntry: TimelineEntry {
    let date: Date
    let f: MGFile
}

/// The file as it is, again every 15 minutes for two hours: My day's current row and the next
/// supplement move with the clock while the app stays closed. The app reloads after each write.
struct MGProvider: TimelineProvider {
    func placeholder(in context: Context) -> MGEntry { MGEntry(date: Date(), f: MGFile()) }
    func getSnapshot(in context: Context, completion: @escaping (MGEntry) -> Void) {
        completion(MGEntry(date: Date(), f: MGFile.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<MGEntry>) -> Void) {
        let f = MGFile.load()
        let now = Date()
        var entries: [MGEntry] = []
        for i in 0..<9 {
            let d = Calendar.current.date(byAdding: .minute, value: 15 * i, to: now) ?? now
            entries.append(MGEntry(date: d, f: f))
        }
        completion(Timeline(entries: entries, policy: .atEnd))
    }
}

// MARK: - looks

enum MG {
    static let protein = Color(red: 0.086, green: 0.925, blue: 0.024)  // WH.green
    static let kcal = Color(red: 1.0, green: 0.624, blue: 0.039)       // #FF9F0A
    static let fiber = Color(red: 0.180, green: 0.902, blue: 0.659)    // WH.steps
    static let water = Color(red: 0.251, green: 0.718, blue: 1.0)      // #40B7FF
    static let pink = Color(red: 1.0, green: 0.361, blue: 0.451)       // #FF5C73
    static let cyan = Color(red: 0.353, green: 0.871, blue: 0.957)     // #5ADEF4

    static let diet = URL(string: "opengym://diet")!
    static let supplements = URL(string: "opengym://supplements")!
    static let day = URL(string: "opengym://day")!

    static func isAccessory(_ f: WidgetFamily) -> Bool {
        f == .accessoryCircular || f == .accessoryRectangular || f == .accessoryInline
    }
    /// "95 / 160 g", or "– / 160 g" when the eaten number is unknown.
    static func of(_ v: Double?, _ target: Double?, _ unit: String) -> String {
        "\(WH.num(v)) / \(WH.num(target))\(unit.isEmpty ? "" : " " + unit)"
    }
    static func litres(_ ml: Double?) -> String {
        guard let ml = ml, ml.isFinite else { return "–" }
        return String(format: "%.1f L", ml / 1000)
    }
    /// Minutes into the health day (lib/ist.js): before 04:00 is the evening before.
    static func minutes(_ hhmm: String?) -> Int? {
        guard let s = hhmm else { return nil }
        let parts = s.split(separator: ":")
        guard parts.count == 2, let h = Int(parts[0]), let m = Int(parts[1]), h >= 0, h < 24, m >= 0, m < 60 else { return nil }
        let v = h * 60 + m
        return v < 240 ? v + 1440 : v
    }
    static func nowMinutes(_ date: Date) -> Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: date)
        let v = (c.hour ?? 0) * 60 + (c.minute ?? 0)
        return v < 240 ? v + 1440 : v
    }
    /// The supplement due next by the widget's own clock, else what the app worked out.
    static func nextSupp(_ s: MGSupps?, _ date: Date) -> MGNextSupp? {
        guard let s = s else { return nil }
        let now = nowMinutes(date)
        let pending = (s.items ?? []).filter { !($0.taken ?? false) && !($0.skipped ?? false) }
        if let up = pending.first(where: { (minutes($0.time) ?? -1) >= now }) {
            return MGNextSupp(name: up.name, time: up.time, overdue: false, id: up.id)
        }
        if let first = pending.first { return MGNextSupp(name: first.name, time: first.time, overdue: true, id: first.id) }
        // Nothing pending: all done today, unless the list never came (then the app's own answer).
        return s.items == nil ? s.next : nil
    }
    /// The schedule row the clock is in: the last one that has started.
    static func currentRow(_ rows: [MGRow], _ date: Date) -> Int? {
        let now = nowMinutes(date)
        var cur: Int? = nil
        for (i, r) in rows.enumerated() {
            if let m = minutes(r.time), m <= now { cur = i }
        }
        return cur
    }
    static func dayLetter(_ iso: String) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        guard let d = f.date(from: iso) else { return "" }
        let o = DateFormatter()
        o.locale = Locale(identifier: "en_US")
        o.dateFormat = "EEEEE"
        return o.string(from: d)
    }
    /// The health day (lib/ist.js healthDay): India time, and before 04:00 is the evening before.
    static func healthDay(_ now: Date = Date()) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(secondsFromGMT: 330 * 60) ?? TimeZone.current
        let c = cal.dateComponents([.year, .month, .day], from: now.addingTimeInterval(-4 * 3600))
        return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
    }
    static func zoneColor(_ z: Double, _ target: [Double]?, _ warn: Double?) -> Color {
        let w = warn ?? 30
        return z > w ? WH.red : z > (target?.last ?? 25) ? WH.yellow : WH.green
    }
}

extension View {
    /// The tap, the Whoop gradient on the Home Screen, and nothing behind a Lock Screen widget.
    func mgChrome(_ family: WidgetFamily, url: URL) -> some View {
        let acc = MG.isAccessory(family)
        return self
            .widgetURL(url)
            .containerBackground(for: .widget) {
                if acc { Color.clear } else { WH.bg }
            }
            .environment(\.colorScheme, acc ? .light : .dark)
    }
}

struct MGHeader: View {
    let title: String
    var trailing: String? = nil
    var trailingColor: Color = WH.dim
    var body: some View {
        HStack(spacing: 4) {
            Text(title).font(.system(size: 10, weight: .black)).tracking(1.5).foregroundColor(.white).lineLimit(1)
            Spacer(minLength: 2)
            if let t = trailing {
                Text(t).font(.system(size: 9, weight: .bold)).foregroundColor(trailingColor).lineLimit(1)
            }
        }
    }
}

struct MGEmpty: View {
    let symbol: String
    let color: Color
    var text: String = "Open myGym"
    /// The snapshot block this widget draws ("diet", "supps", "whoop"): its reason code shows under the
    /// line (SharedSnapshot.blockNote), so a screenshot says whether the data or only the block is missing.
    var block: String? = nil
    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: symbol).font(.title2).foregroundColor(color)
            Text("–").font(.system(size: 20, weight: .heavy, design: .rounded)).foregroundColor(WH.dim)
            Text(text).font(.caption2).multilineTextAlignment(.center).foregroundColor(WH.dim)
            if let block = block {
                let note = SharedSnapshot.blockNote(block)
                if !note.isEmpty {
                    Text(verbatim: note).font(.system(size: 8, design: .monospaced)).foregroundColor(WH.dim.opacity(0.7)).lineLimit(2)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

/// A widget button's face: a small filled capsule (the Button(intent:) around it is the caller's).
struct MGTapLabel: View {
    let title: String
    let symbol: String
    let color: Color
    var body: some View {
        HStack(spacing: 3) {
            Image(systemName: symbol).font(.system(size: 9, weight: .black))
            Text(title).font(.system(size: 10, weight: .heavy, design: .rounded)).lineLimit(1)
        }
        .foregroundColor(.black)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(Capsule().fill(color))
    }
}

/// Under every widget button: the widget cannot reach the server, the app sends the tap.
struct MGSavesNote: View {
    var body: some View {
        Text("Saves when myGym opens").font(.system(size: 7, weight: .semibold)).foregroundColor(WH.dim)
            .lineLimit(1).minimumScaleFactor(0.7)
    }
}

/// A labelled progress bar with a glow: "PROTEIN   95 / 160 g".
struct MGBar: View {
    let label: String
    let value: String
    let frac: Double?
    let color: Color
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 4) {
                Text(label.uppercased()).font(.system(size: 9, weight: .bold)).tracking(0.8).foregroundColor(WH.dim).lineLimit(1)
                Spacer(minLength: 2)
                Text(value).font(.system(size: 11, weight: .heavy, design: .rounded)).monospacedDigit()
                    .foregroundColor(frac == nil ? WH.dim : .white).lineLimit(1).minimumScaleFactor(0.6)
            }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.08))
                    if let f = frac {
                        Capsule()
                            .fill(LinearGradient(colors: [color.opacity(0.55), color], startPoint: .leading, endPoint: .trailing))
                            .frame(width: Swift.max(4, g.size.width * CGFloat(f)))
                            .shadow(color: color.opacity(0.5), radius: 3)
                    }
                }
            }
            .frame(height: 6)
        }
    }
}

/// A 7-day line, each point in the middle of its day's slot (so it sits over WBars' bars).
/// `range` fixes the scale (strain 0...21); without it the line spans its own low and high.
struct MGSpark: View {
    let values: [Double?]
    let color: Color
    var range: ClosedRange<Double>? = nil

    var body: some View {
        GeometryReader { g in
            let pts = MGSpark.points(values, g.size, range)
            ZStack {
                if pts.count > 1 {
                    Path { p in
                        p.move(to: pts[0])
                        for q in pts.dropFirst() { p.addLine(to: q) }
                    }
                    .stroke(color, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                    .shadow(color: color.opacity(0.6), radius: 3)
                }
                if let last = pts.last {
                    Circle().fill(color).frame(width: 5, height: 5).position(last)
                }
            }
        }
    }

    static func points(_ values: [Double?], _ size: CGSize, _ range: ClosedRange<Double>?) -> [CGPoint] {
        let known = values.compactMap { $0 }
        guard !values.isEmpty, let kLo = known.min(), let kHi = known.max() else { return [] }
        let lo = range?.lowerBound ?? kLo
        let hi = range?.upperBound ?? kHi
        let n = CGFloat(values.count)
        var out: [CGPoint] = []
        for (i, v) in values.enumerated() {
            guard let v = v else { continue }
            let ratio = hi > lo ? Swift.max(0, Swift.min(1, (v - lo) / (hi - lo))) : 0.5
            let x = size.width * (CGFloat(i) + 0.5) / n
            let y = size.height - 3 - (size.height - 6) * CGFloat(ratio)
            out.append(CGPoint(x: x, y: y))
        }
        return out
    }
}

/// Zone 4-5 minutes this week against the budget, the warning line in red.
struct MGZoneBar: View {
    let w: WhoopBlock?
    var body: some View {
        let z = w?.zoneMin
        let warn = w?.zoneWarn ?? 30
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text("ZONE 4-5").font(.system(size: 9, weight: .bold)).tracking(0.8).foregroundColor(WH.dim)
                Spacer()
                Text("\(WH.num(z)) / \(WH.num(w?.zoneTarget?.first))-\(WH.num(w?.zoneTarget?.last)) min")
                    .font(.system(size: 10, weight: .bold)).monospacedDigit()
                    .foregroundColor(z.map { MG.zoneColor($0, w?.zoneTarget, w?.zoneWarn) } ?? WH.dim)
            }
            GeometryReader { g in
                let top = Swift.max(warn, z ?? 0) * 1.15
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.08))
                    if let z = z, top > 0 {
                        Capsule().fill(MG.zoneColor(z, w?.zoneTarget, w?.zoneWarn))
                            .frame(width: Swift.max(4, g.size.width * CGFloat(Swift.min(1, z / top))))
                            .shadow(color: MG.zoneColor(z, w?.zoneTarget, w?.zoneWarn).opacity(0.5), radius: 3)
                    }
                    if top > 0 {
                        Rectangle().fill(WH.red).frame(width: 2).offset(x: g.size.width * CGFloat(warn / top))
                    }
                }
            }
            .frame(height: 7)
        }
    }
}

// MARK: - Macros

struct MacrosView: View {
    @Environment(\.widgetFamily) private var family
    let entry: MGEntry

    var body: some View {
        let d = entry.f.diet
        Group {
            switch family {
            case .accessoryCircular:
                Gauge(value: WH.frac(d?.protein, d?.proteinTarget ?? 165) ?? 0) {
                    Text("P")
                } currentValueLabel: {
                    Text(WH.num(d?.proteinLeft)).font(.system(size: 15, weight: .heavy, design: .rounded)).monospacedDigit()
                }
                .gaugeStyle(.accessoryCircular)
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 2) {
                    Text("Protein \(MG.of(d?.protein, d?.proteinTarget, "g"))").font(.headline).widgetAccentable().lineLimit(1).minimumScaleFactor(0.7)
                    Gauge(value: WH.frac(d?.protein, d?.proteinTarget ?? 165) ?? 0) { EmptyView() }.gaugeStyle(.accessoryLinearCapacity)
                    Text("\(WH.num(d?.kcal)) kcal · fiber \(WH.num(d?.fiber)) g · \(MG.litres(d?.water))").font(.caption2).lineLimit(1).minimumScaleFactor(0.7)
                }
            default:
                if let d = d {
                    if family == .systemMedium { medium(d) } else { small(d) }
                } else {
                    MGEmpty(symbol: "fork.knife", color: MG.protein, block: "diet")
                }
            }
        }
        .mgChrome(family, url: MG.diet)
    }

    func bars(_ d: MGDiet) -> some View {
        VStack(spacing: 7) {
            MGBar(label: "Protein", value: MG.of(d.protein, d.proteinTarget, "g"), frac: WH.frac(d.protein, d.proteinTarget ?? 165), color: MG.protein)
            MGBar(label: "kcal", value: MG.of(d.kcal, d.kcalTarget, ""), frac: WH.frac(d.kcal, d.kcalTarget ?? 2000), color: MG.kcal)
            MGBar(label: "Fiber", value: MG.of(d.fiber, d.fiberTarget, "g"), frac: WH.frac(d.fiber, d.fiberTarget ?? 35), color: MG.fiber)
            MGBar(label: "Water", value: "\(MG.litres(d.water)) / \(MG.litres(d.waterTarget))", frac: WH.frac(d.water, d.waterTarget ?? 2500), color: MG.water)
        }
    }

    /// +250 ml (AddWaterIntent), with the note that the app sends it.
    func waterButton(_ align: HorizontalAlignment) -> some View {
        VStack(alignment: align, spacing: 1) {
            Button(intent: AddWaterIntent(ml: 250)) {
                MGTapLabel(title: "+250 ml", symbol: "drop.fill", color: MG.water)
            }
            .buttonStyle(.plain)
            MGSavesNote()
        }
    }

    func small(_ d: MGDiet) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(alignment: .top, spacing: 4) {
                Text("MACROS").font(.system(size: 10, weight: .black)).tracking(1.5).foregroundColor(.white)
                    .lineLimit(1).fixedSize()
                Spacer(minLength: 2)
                waterButton(.trailing)
            }
            Spacer(minLength: 0)
            bars(d)
        }
    }

    func medium(_ d: MGDiet) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            MGHeader(title: "MACROS", trailing: d.dayType?.uppercased())
            HStack(spacing: 14) {
                VStack(spacing: 4) {
                    WRing(frac: WH.frac(d.protein, d.proteinTarget ?? 165), color: MG.protein, value: WH.num(d.proteinLeft), unit: "g", label: "protein left", line: 9, font: 22)
                    waterButton(.center)
                }
                .frame(width: 104)
                bars(d)
            }
        }
    }
}

struct MacrosWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MyGymMacros", provider: MGProvider()) { entry in
            MacrosView(entry: entry)
        }
        .configurationDisplayName("Macros")
        .description("Protein, calories, fiber and water today against your targets.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryCircular])
    }
}

// MARK: - Supplements

struct SuppRowView: View {
    let s: MGSupp
    var body: some View {
        let taken = s.taken ?? false
        let skipped = s.skipped ?? false
        HStack(spacing: 5) {
            Image(systemName: taken ? "checkmark.circle.fill" : skipped ? "xmark.circle" : "circle")
                .font(.system(size: 11, weight: .bold))
                .foregroundColor(taken ? WH.green : skipped ? WH.dim : ((s.d3 ?? false) ? WH.yellow : .white))
            Text(s.name ?? "–").font(.system(size: 11, weight: .semibold)).foregroundColor(taken || skipped ? WH.dim : .white)
                .strikethrough(taken, color: WH.dim).lineLimit(1)
            Spacer(minLength: 2)
            Text(s.time ?? "").font(.system(size: 10, weight: .bold, design: .rounded)).monospacedDigit().foregroundColor(WH.dim)
        }
    }
}

struct D3Badge: View {
    let taken: Bool
    var body: some View {
        Text(taken ? "D3 TAKEN" : "D3 SUNDAY")
            .font(.system(size: 9, weight: .black)).tracking(0.8)
            .foregroundColor(.black)
            .padding(.horizontal, 6).padding(.vertical, 2)
            .background(Capsule().fill(taken ? WH.green : WH.yellow))
            .shadow(color: (taken ? WH.green : WH.yellow).opacity(0.6), radius: 4)
    }
}

struct SupplementsView: View {
    @Environment(\.widgetFamily) private var family
    let entry: MGEntry

    var body: some View {
        let s = entry.f.supps
        let next = MG.nextSupp(s, entry.date)
        Group {
            switch family {
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    if let n = next {
                        Text("Next: \(n.name ?? "–")").font(.headline).widgetAccentable().lineLimit(1).minimumScaleFactor(0.7)
                        Text(SupplementsView.whenLine(n)).font(.caption).lineLimit(1)
                    } else {
                        Text(s == nil ? "Supplements" : "All done").font(.headline).widgetAccentable()
                    }
                    Text(SupplementsView.pendingLine(s)).font(.caption).lineLimit(1)
                }
            default:
                if let s = s {
                    if family == .systemMedium { medium(s, next) } else { small(s, next) }
                } else {
                    MGEmpty(symbol: "pills.fill", color: WH.yellow, block: "supps")
                }
            }
        }
        .mgChrome(family, url: MG.supplements)
    }

    static func whenLine(_ n: MGNextSupp) -> String {
        let time: String = n.time ?? "any time"
        return (n.overdue ?? false) ? time + " · overdue" : time
    }

    static func pendingLine(_ s: MGSupps?) -> String {
        guard let s = s else { return "Open myGym" }
        let line: String = WH.num(s.pending) + " pending"
        return (s.d3Due ?? false) ? line + " · D3 today" : line
    }

    func nextBlock(_ next: MGNextSupp?, big: CGFloat, lines: Int = 2) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("NEXT").font(.system(size: 9, weight: .bold)).tracking(0.8).foregroundColor(WH.dim)
            if let n = next {
                Text(n.name ?? "–").font(.system(size: big, weight: .heavy, design: .rounded)).foregroundColor(.white).lineLimit(lines).minimumScaleFactor(0.6)
                Text(n.time ?? "any time").font(.system(size: 12, weight: .bold, design: .rounded)).monospacedDigit()
                    .foregroundColor((n.overdue ?? false) ? WH.red : WH.green)
            } else {
                Text("All done").font(.system(size: big, weight: .heavy, design: .rounded)).foregroundColor(WH.green)
            }
        }
    }

    func pendingRows(_ s: MGSupps) -> [MGSupp] {
        (s.items ?? []).filter { !($0.taken ?? false) && !($0.skipped ?? false) }
    }

    /// Taken for the item due next (SuppTakenIntent), with the note that the app sends it.
    func takenButton(_ id: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Button(intent: SuppTakenIntent(suppId: id)) {
                MGTapLabel(title: "Taken", symbol: "checkmark", color: WH.green)
            }
            .buttonStyle(.plain)
            MGSavesNote()
        }
    }

    func small(_ s: MGSupps, _ next: MGNextSupp?) -> some View {
        let tapId: String? = next?.id
        return VStack(alignment: .leading, spacing: 5) {
            MGHeader(title: "SUPPS", trailing: "\(WH.num(s.pending)) left", trailingColor: (s.pending ?? 0) > 0 ? WH.yellow : WH.green)
            if s.d3Due ?? false { D3Badge(taken: s.d3Taken ?? false) }
            nextBlock(next, big: 16, lines: tapId == nil ? 2 : 1)
            Spacer(minLength: 0)
            if let id = tapId {
                takenButton(id)
            } else {
                ForEach(Array(pendingRows(s).prefix((s.d3Due ?? false) ? 1 : 2).enumerated()), id: \.offset) { _, r in
                    SuppRowView(s: r)
                }
            }
        }
    }

    func medium(_ s: MGSupps, _ next: MGNextSupp?) -> some View {
        let tapId: String? = next?.id
        return HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 5) {
                MGHeader(title: "SUPPLEMENTS")
                nextBlock(next, big: 18, lines: tapId == nil ? 2 : 1)
                if let id = tapId { takenButton(id) }
                Spacer(minLength: 0)
                if s.d3Due ?? false { D3Badge(taken: s.d3Taken ?? false) }
                Text("\(WH.num(s.pending)) of \(WH.num(s.total)) pending").font(.system(size: 10, weight: .semibold)).foregroundColor(WH.dim)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .leading, spacing: 5) {
                ForEach(Array((s.items ?? []).prefix(6).enumerated()), id: \.offset) { _, r in
                    SuppRowView(s: r)
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

struct SupplementsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MyGymSupplements", provider: MGProvider()) { entry in
            SupplementsView(entry: entry)
        }
        .configurationDisplayName("Supplements")
        .description("What is due next, what is still pending, and the D3 Sunday.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

// MARK: - My day

struct ScheduleRowView: View {
    let row: MGRow
    let current: Bool
    var body: some View {
        HStack(spacing: 6) {
            Text(row.time).font(.system(size: 10, weight: .bold, design: .rounded)).monospacedDigit()
                .foregroundColor(current ? .black : WH.dim)
            Text(row.label).font(.system(size: 11, weight: current ? .heavy : .semibold))
                .foregroundColor(current ? .black : .white).lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 6).padding(.vertical, 2)
        .background(RoundedRectangle(cornerRadius: 5).fill(current ? WH.green : Color.clear))
        .shadow(color: current ? WH.green.opacity(0.5) : Color.clear, radius: 4)
    }
}

struct MyDayView: View {
    @Environment(\.widgetFamily) private var family
    let entry: MGEntry

    var body: some View {
        Group {
            if family == .systemLarge { large } else { medium }
        }
        .mgChrome(family, url: MG.day)
    }

    var rows: [MGRow] { entry.f.day?.schedule ?? [] }
    var cur: Int? { MG.currentRow(rows, entry.date) }

    /// The current row and a few after it (from the first row before the day starts).
    func visibleRows(_ n: Int) -> [(offset: Int, element: MGRow)] {
        let from = Swift.max(0, cur ?? 0)
        return Array(Array(rows.enumerated()).dropFirst(from).prefix(n))
    }

    @ViewBuilder func schedule(_ n: Int) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("SCHEDULE").font(.system(size: 9, weight: .bold)).tracking(0.8).foregroundColor(WH.dim)
            if rows.isEmpty {
                Text("No schedule").font(.system(size: 11, weight: .semibold)).foregroundColor(WH.dim)
            } else {
                ForEach(visibleRows(n), id: \.offset) { item in
                    ScheduleRowView(row: item.element, current: item.offset == cur)
                }
            }
        }
    }

    @ViewBuilder func workout(_ lifts: Int) -> some View {
        let w = entry.f.day?.workout
        VStack(alignment: .leading, spacing: 2) {
            Text("WORKOUT").font(.system(size: 9, weight: .bold)).tracking(0.8).foregroundColor(WH.dim)
            if let w = w {
                HStack(spacing: 4) {
                    Text(w.name ?? "–").font(.system(size: 14, weight: .heavy, design: .rounded)).foregroundColor(.white).lineLimit(1).minimumScaleFactor(0.7)
                    if w.done ?? false {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 11, weight: .bold)).foregroundColor(WH.green)
                    }
                    Spacer(minLength: 0)
                    Text("\(WH.num(w.count)) ex").font(.system(size: 10, weight: .bold)).monospacedDigit().foregroundColor(WH.dim)
                }
                ForEach(Array((w.lifts ?? []).prefix(lifts).enumerated()), id: \.offset) { _, l in
                    HStack(spacing: 4) {
                        Text(l.name ?? "–").font(.system(size: 10, weight: .semibold)).foregroundColor(.white).lineLimit(1)
                        Spacer(minLength: 2)
                        Text(l.line ?? "").font(.system(size: 10, weight: .bold, design: .rounded)).monospacedDigit().foregroundColor(WH.dim).lineLimit(1)
                    }
                }
            } else {
                Text(entry.f.day == nil ? "Open myGym" : "Rest day").font(.system(size: 13, weight: .heavy, design: .rounded)).foregroundColor(WH.dim)
                if entry.f.day == nil {
                    // myGym: why (SharedSnapshot.blockNote), so a screenshot says where it breaks.
                    Text(verbatim: SharedSnapshot.blockNote("day")).font(.system(size: 8, design: .monospaced)).foregroundColor(WH.dim.opacity(0.7)).lineLimit(2)
                }
            }
        }
    }

    func rings(_ size: CGFloat) -> some View {
        let w = entry.f.whoop
        return HStack(spacing: 6) {
            WRing(frac: WH.frac(w?.recovery, 100), color: WH.band(w?.recovery), value: WH.num(w?.recovery), label: "Rec", line: 4, font: size)
            WRing(frac: WH.frac(w?.strain, 21), color: WH.strain, value: WH.num(w?.strain, 1), label: "Strain", line: 4, font: size)
            WRing(frac: WH.frac(w?.sleepPerf, 100), color: WH.sleep, value: WH.num(w?.sleepPerf), label: "Sleep", line: 4, font: size)
        }
    }

    var suppsLine: some View {
        let s = entry.f.supps
        let next = MG.nextSupp(s, entry.date)
        return HStack(spacing: 4) {
            Image(systemName: "pills.fill").font(.system(size: 10, weight: .bold)).foregroundColor(WH.yellow)
            Text(MyDayView.suppsText(s, next))
                .font(.system(size: 10, weight: .semibold)).foregroundColor(.white).lineLimit(1)
            Spacer(minLength: 0)
            if s?.d3Due ?? false { D3Badge(taken: s?.d3Taken ?? false) }
        }
    }

    static func suppsText(_ s: MGSupps?, _ next: MGNextSupp?) -> String {
        guard let s = s else { return "Supplements –" }
        let line: String = WH.num(s.pending) + " pending"
        guard let n = next else { return line }
        return line + " · next " + (n.name ?? "–")
    }

    func macroBars(_ full: Bool) -> some View {
        let d = entry.f.diet
        return VStack(spacing: 5) {
            MGBar(label: "Protein", value: MG.of(d?.protein, d?.proteinTarget, "g"), frac: WH.frac(d?.protein, d?.proteinTarget ?? 165), color: MG.protein)
            if full {
                MGBar(label: "kcal", value: MG.of(d?.kcal, d?.kcalTarget, ""), frac: WH.frac(d?.kcal, d?.kcalTarget ?? 2000), color: MG.kcal)
                MGBar(label: "Fiber", value: MG.of(d?.fiber, d?.fiberTarget, "g"), frac: WH.frac(d?.fiber, d?.fiberTarget ?? 35), color: MG.fiber)
            }
            MGBar(label: "Water", value: "\(MG.litres(d?.water)) / \(MG.litres(d?.waterTarget))", frac: WH.frac(d?.water, d?.waterTarget ?? 2500), color: MG.water)
        }
    }

    var medium: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 6) {
                if rows.isEmpty { workout(3) } else { schedule(4) }
                Spacer(minLength: 0)
                suppsLine
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(spacing: 6) {
                rings(11).frame(height: 54)
                macroBars(false)
            }
            .frame(maxWidth: .infinity)
        }
    }

    var large: some View {
        VStack(alignment: .leading, spacing: 9) {
            MGHeader(title: "MY DAY", trailing: entry.date.formatted(.dateTime.weekday(.wide).day().month()))
            HStack(alignment: .top, spacing: 12) {
                schedule(7).frame(maxWidth: .infinity, alignment: .leading)
                workout(4).frame(maxWidth: .infinity, alignment: .leading)
            }
            Spacer(minLength: 0)
            macroBars(true)
            suppsLine
            rings(14).frame(height: 62)
        }
    }
}

struct MyDayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MyGymDay", provider: MGProvider()) { entry in
            MyDayView(entry: entry)
        }
        .configurationDisplayName("My day")
        .description("Your schedule, today's workout, macros, supplements and Whoop at a glance.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

// MARK: - Whoop metric (configurable)

enum MGMetric: String, CaseIterable, AppEnum {
    case recovery, strain, sleep, hrv, rhr, steps, spo2, zone

    static let typeDisplayRepresentation: TypeDisplayRepresentation = "Metric"
    static let caseDisplayRepresentations: [MGMetric: DisplayRepresentation] = [
        .recovery: DisplayRepresentation(title: "Recovery", image: .init(systemName: "heart.fill")),
        .strain: DisplayRepresentation(title: "Strain", image: .init(systemName: "flame.fill")),
        .sleep: DisplayRepresentation(title: "Sleep", image: .init(systemName: "bed.double.fill")),
        .hrv: DisplayRepresentation(title: "HRV", image: .init(systemName: "waveform.path.ecg")),
        .rhr: DisplayRepresentation(title: "Resting heart rate", image: .init(systemName: "heart.text.square")),
        .steps: DisplayRepresentation(title: "Steps", image: .init(systemName: "figure.walk")),
        .spo2: DisplayRepresentation(title: "SpO2", image: .init(systemName: "lungs.fill")),
        .zone: DisplayRepresentation(title: "Zone 4-5 minutes", image: .init(systemName: "bolt.heart.fill")),
    ]
}

struct MGMetricIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Whoop metric"
    static let description = IntentDescription("Pick the Whoop number the widget shows.")

    @Parameter(title: "Metric", default: .recovery)
    var metric: MGMetric

    @Parameter(title: "And beside it", default: .sleep)
    var second: MGMetric

    init() {}
}

struct MGMetricEntry: TimelineEntry {
    let date: Date
    let f: MGFile
    let metric: MGMetric
    let second: MGMetric
}

struct MGMetricProvider: AppIntentTimelineProvider {
    func placeholder(in context: Context) -> MGMetricEntry {
        MGMetricEntry(date: Date(), f: MGFile(), metric: .recovery, second: .sleep)
    }
    func snapshot(for configuration: MGMetricIntent, in context: Context) async -> MGMetricEntry {
        MGMetricEntry(date: Date(), f: MGFile.load(), metric: configuration.metric, second: configuration.second)
    }
    func timeline(for configuration: MGMetricIntent, in context: Context) async -> Timeline<MGMetricEntry> {
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date()) ?? Date()
        let e = MGMetricEntry(date: Date(), f: MGFile.load(), metric: configuration.metric, second: configuration.second)
        return Timeline(entries: [e], policy: .after(next))
    }
}

/// One metric, ready to draw.
struct MGValue {
    let title: String
    let short: String
    let value: String
    let unit: String
    let frac: Double?
    let color: Color
    let symbol: String
    let week: [Double?]?
    let range: ClosedRange<Double>?

    static func of(_ m: MGMetric, _ f: MGFile) -> MGValue {
        let w = f.whoop
        let k = f.weeks
        switch m {
        case .recovery:
            return MGValue(title: "RECOVERY", short: "Recovery", value: WH.num(w?.recovery), unit: "%", frac: WH.frac(w?.recovery, 100),
                           color: WH.band(w?.recovery), symbol: "heart.fill", week: w?.week, range: 0.0...100.0)
        case .strain:
            return MGValue(title: "STRAIN", short: "Strain", value: WH.num(w?.strain, 1), unit: "", frac: WH.frac(w?.strain, 21),
                           color: WH.strain, symbol: "flame.fill", week: w?.strainWeek, range: 0.0...21.0)
        case .sleep:
            return MGValue(title: "SLEEP", short: "Sleep", value: WH.sleep(w?.sleepMin), unit: "", frac: WH.frac(w?.sleepMin, w?.sleepNeedMin ?? 480),
                           color: WH.sleep, symbol: "bed.double.fill", week: k?.sleepWeek, range: nil)
        case .hrv:
            return MGValue(title: "HRV", short: "HRV", value: WH.num(w?.hrv), unit: "ms", frac: WH.frac(w?.hrv, 150),
                           color: WH.green, symbol: "waveform.path.ecg", week: k?.hrvWeek, range: nil)
        case .rhr:
            return MGValue(title: "RESTING HR", short: "RHR", value: WH.num(w?.rhr), unit: "bpm", frac: WH.frac(w?.rhr, 100),
                           color: MG.pink, symbol: "heart.text.square", week: k?.rhrWeek, range: nil)
        case .steps:
            return MGValue(title: "STEPS", short: "Steps", value: WH.steps(w?.steps), unit: "", frac: WH.frac(w?.steps, w?.stepGoal ?? 8000),
                           color: WH.steps, symbol: "figure.walk", week: k?.stepsWeek, range: nil)
        case .spo2:
            let sp: Double? = w?.spo2
            let frac: Double? = sp.map { Swift.max(0, Swift.min(1, ($0 - 90) / 10)) }
            return MGValue(title: "SPO2", short: "SpO2", value: WH.num(w?.spo2, 1), unit: "%", frac: frac,
                           color: MG.cyan, symbol: "lungs.fill", week: k?.spo2Week, range: nil)
        case .zone:
            let z = w?.zoneMin
            return MGValue(title: "ZONE 4-5", short: "Zone 4-5", value: WH.num(z), unit: "min", frac: WH.frac(z, w?.zoneWarn ?? 30),
                           color: z.map { MG.zoneColor($0, w?.zoneTarget, w?.zoneWarn) } ?? WH.green, symbol: "bolt.heart.fill", week: nil, range: nil)
        }
    }

    /// Short enough for a Lock Screen circle: steps as "8.2k".
    var compact: String {
        if short == "Steps", let s = Double(value.filter { $0.isNumber }) {
            return s >= 10000 ? String(format: "%.0fk", s / 1000) : String(format: "%.1fk", s / 1000)
        }
        if short == "Sleep" { return value.replacingOccurrences(of: " ", with: "") }
        return value
    }
}

struct MetricColumn: View {
    let v: MGValue
    var ringFont: CGFloat = 26
    var line: CGFloat = 9
    var body: some View {
        VStack(spacing: 5) {
            HStack(spacing: 4) {
                Image(systemName: v.symbol).font(.system(size: 9, weight: .bold)).foregroundColor(v.color)
                Text(v.title).font(.system(size: 10, weight: .black)).tracking(1.2).foregroundColor(.white).lineLimit(1)
                Spacer(minLength: 0)
            }
            WRing(frac: v.frac, color: v.color, value: v.value, unit: v.unit, line: line, font: ringFont)
            if let week = v.week, week.compactMap({ $0 }).count > 1 {
                MGSpark(values: week, color: v.color, range: v.range).frame(height: 20)
            } else {
                Text("7 days: –").font(.system(size: 9, weight: .semibold)).foregroundColor(WH.dim).frame(height: 20)
            }
        }
    }
}

struct WhoopMetricView: View {
    @Environment(\.widgetFamily) private var family
    let entry: MGMetricEntry

    var body: some View {
        let v = MGValue.of(entry.metric, entry.f)
        let hasData = entry.f.whoop != nil
        Group {
            switch family {
            case .accessoryCircular:
                Gauge(value: v.frac ?? 0) {
                    Image(systemName: v.symbol)
                } currentValueLabel: {
                    Text(v.compact).font(.system(size: 14, weight: .heavy, design: .rounded)).monospacedDigit().minimumScaleFactor(0.5)
                }
                .gaugeStyle(.accessoryCircular)
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 1) {
                    Text("\(v.short) \(v.value)\(v.unit.isEmpty ? "" : " " + v.unit)").font(.headline).widgetAccentable().lineLimit(1).minimumScaleFactor(0.7)
                    if let week = v.week, week.compactMap({ $0 }).count > 1 {
                        MGSpark(values: week, color: .primary, range: v.range).frame(height: 22)
                    } else {
                        Text(hasData ? "Whoop" : "Open myGym").font(.caption).lineLimit(1)
                    }
                }
            case .accessoryInline:
                Text("\(v.short) \(v.value)\(v.unit.isEmpty ? "" : " " + v.unit)")
            case .systemMedium:
                if hasData {
                    HStack(spacing: 14) {
                        MetricColumn(v: v, ringFont: 22, line: 8)
                        MetricColumn(v: MGValue.of(entry.second, entry.f), ringFont: 22, line: 8)
                    }
                } else {
                    MGEmpty(symbol: "heart.text.square", color: WH.red, text: "Open myGym to sync Whoop", block: "whoop")
                }
            default:
                if hasData {
                    MetricColumn(v: v)
                } else {
                    MGEmpty(symbol: "heart.text.square", color: WH.red, text: "Open myGym to sync Whoop", block: "whoop")
                }
            }
        }
        .mgChrome(family, url: WH.link)
    }
}

struct WhoopMetricWidget: Widget {
    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: "MyGymWhoopMetric", intent: MGMetricIntent.self, provider: MGMetricProvider()) { entry in
            WhoopMetricView(entry: entry)
        }
        .configurationDisplayName("Whoop metric")
        .description("One Whoop number with its last 7 days. You pick: recovery, strain, sleep, HRV, RHR, steps, SpO2 or zone 4-5.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

// MARK: - Week

struct WhoopWeekView: View {
    @Environment(\.widgetFamily) private var family
    let entry: MGEntry

    var body: some View {
        Group {
            if let w = entry.f.whoop {
                if family == .systemLarge { large(w) } else { medium(w) }
            } else {
                MGEmpty(symbol: "calendar", color: WH.strain, text: "Open myGym to sync Whoop", block: "whoop")
            }
        }
        .mgChrome(family, url: WH.link)
    }

    static func avg(_ v: [Double?]?) -> Double? {
        let k = (v ?? []).compactMap { $0 }
        return k.isEmpty ? nil : k.reduce(0, +) / Double(k.count)
    }

    func chart(_ w: WhoopBlock) -> some View {
        let rec = w.week ?? []
        let strain = w.strainWeek ?? []
        let days = w.weekDays ?? []
        return VStack(spacing: 3) {
            ZStack {
                WBars(values: rec, max: 100, color: { WH.band($0) }).opacity(0.85)
                if strain.count == rec.count, strain.compactMap({ $0 }).count > 1 {
                    MGSpark(values: strain, color: WH.strain, range: 0.0...21.0)
                }
            }
            HStack(spacing: 3) {
                ForEach(Array(days.enumerated()), id: \.offset) { _, d in
                    Text(MG.dayLetter(d)).font(.system(size: 8, weight: .bold)).foregroundColor(WH.dim).frame(maxWidth: .infinity)
                }
            }
        }
    }

    func legend(_ w: WhoopBlock) -> some View {
        HStack(spacing: 10) {
            HStack(spacing: 3) {
                RoundedRectangle(cornerRadius: 1).fill(WH.green).frame(width: 7, height: 7)
                Text("Recovery \(WH.num(WhoopWeekView.avg(w.week)))% avg").font(.system(size: 9, weight: .semibold)).foregroundColor(WH.dim)
            }
            HStack(spacing: 3) {
                Capsule().fill(WH.strain).frame(width: 10, height: 2)
                Text("Strain \(WH.num(WhoopWeekView.avg(w.strainWeek), 1)) avg").font(.system(size: 9, weight: .semibold)).foregroundColor(WH.dim)
            }
            Spacer(minLength: 0)
        }
    }

    func medium(_ w: WhoopBlock) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            MGHeader(title: "WHOOP WEEK", trailing: WH.ago(w.syncedAt))
            chart(w)
            legend(w)
            MGZoneBar(w: w)
        }
    }

    func large(_ w: WhoopBlock) -> some View {
        let k = entry.f.weeks
        return VStack(alignment: .leading, spacing: 9) {
            MGHeader(title: "WHOOP WEEK", trailing: WH.ago(w.syncedAt))
            chart(w).frame(height: 120)
            legend(w)
            MGZoneBar(w: w)
            HStack(spacing: 12) {
                weekStat("HRV", WH.num(WhoopWeekView.avg(k?.hrvWeek)), "ms", k?.hrvWeek, WH.green)
                weekStat("SLEEP", WH.sleep(WhoopWeekView.avg(k?.sleepWeek)), "", k?.sleepWeek, WH.sleep)
                weekStat("RHR", WH.num(WhoopWeekView.avg(k?.rhrWeek)), "bpm", k?.rhrWeek, MG.pink)
            }
            Spacer(minLength: 0)
        }
    }

    func weekStat(_ label: String, _ value: String, _ unit: String, _ week: [Double?]?, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            WStat(label: label + " AVG" + (unit.isEmpty ? "" : " " + unit), value: value, color: color)
            MGSpark(values: week ?? [], color: color).frame(height: 22)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct WhoopWeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "MyGymWeek", provider: MGProvider()) { entry in
            WhoopWeekView(entry: entry)
        }
        .configurationDisplayName("Week")
        .description("Seven days of Whoop recovery and strain, and this week's zone 4-5 budget.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

/// The five above, as one entry in OpenGymWidgets' bundle (a bundle body takes at most ten).
struct MyGymWidgetBundle: WidgetBundle {
    var body: some Widget {
        MacrosWidget()
        SupplementsWidget()
        MyDayWidget()
        WhoopMetricWidget()
        WhoopWeekWidget()
    }
}

// MARK: - the buttons (+250 ml on Macros, Taken on Supplements)

/*
 * The widget has no session and cannot reach the server. A tap queues the action in the shared
 * keychain (WidgetActionQueue, App/WorkoutActivity.swift), draws the new number straight away by
 * editing the snapshot copy, and the app sends it the next time it opens (lib/widget-actions.js,
 * WidgetBridgePlugin.drainActions). Each action has its own id, so the app posts it once.
 */
enum WidgetTap {
    static func nowMs() -> Double { (Date().timeIntervalSince1970 * 1000).rounded() }

    static func water(_ ml: Int) {
        let day = MG.healthDay()
        WidgetActionQueue.append(["id": UUID().uuidString, "kind": "water", "amount": ml, "day": day, "at": nowMs()])
        editSnapshot { root in
            guard var diet = root["diet"] as? [String: Any] else { return }
            if (diet["day"] as? String) == day {
                let had: Double = (diet["water"] as? Double) ?? 0
                diet["water"] = had + Double(ml)
            } else {
                // The copy is from another day: only the water is known for today.
                diet["day"] = day
                for k in ["dayType", "kcal", "protein", "proteinLeft", "fiber"] { diet[k] = NSNull() }
                diet["water"] = Double(ml)
            }
            root["diet"] = diet
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    static func supplementTaken(_ suppId: String) {
        let day = MG.healthDay()
        WidgetActionQueue.append(["id": UUID().uuidString, "kind": "supp", "suppId": suppId, "day": day, "at": nowMs()])
        editSnapshot { root in
            guard var supps = root["supps"] as? [String: Any], var items = supps["items"] as? [[String: Any]] else { return }
            guard let i = items.firstIndex(where: { ($0["id"] as? String) == suppId }) else { return }
            let wasOpen = !((items[i]["taken"] as? Bool) ?? false) && !((items[i]["skipped"] as? Bool) ?? false)
            items[i]["taken"] = true
            items[i]["skipped"] = false
            if (items[i]["d3"] as? Bool) == true { supps["d3Taken"] = true }
            supps["items"] = items
            if wasOpen, let p = supps["pending"] as? Double { supps["pending"] = Swift.max(0, p - 1) }
            // The widget works the next one out from the items itself (MG.nextSupp).
            supps["next"] = NSNull()
            root["supps"] = supps
        }
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// The snapshot as plain JSON, changed and written back where the widgets read it.
    static func editSnapshot(_ change: (inout [String: Any]) -> Void) {
        guard let data = SharedSnapshot.load(),
              var root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { return }
        change(&root)
        guard let out = try? JSONSerialization.data(withJSONObject: root) else { return }
        SharedSnapshot.save(out)
    }
}

/// Macros' +250 ml.
struct AddWaterIntent: AppIntent {
    static let title: LocalizedStringResource = "Add water"
    static let isDiscoverable = false

    @Parameter(title: "Millilitres") var ml: Int

    init() {}

    init(ml: Int) {
        self.ml = ml
    }

    func perform() async throws -> some IntentResult {
        WidgetTap.water(ml)
        return .result()
    }
}

/// Supplements' Taken, for the item due next.
struct SuppTakenIntent: AppIntent {
    static let title: LocalizedStringResource = "Supplement taken"
    static let isDiscoverable = false

    @Parameter(title: "Supplement") var suppId: String

    init() {}

    init(suppId: String) {
        self.suppId = suppId
    }

    func perform() async throws -> some IntentResult {
        WidgetTap.supplementTaken(suppId)
        return .result()
    }
}
