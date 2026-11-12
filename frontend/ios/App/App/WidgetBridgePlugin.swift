import Capacitor
import Foundation
import WidgetKit

/**
 * Hands the Home Screen and Lock Screen widgets what they show (lib/widgets.js builds it): the shared
 * keychain item (SharedSnapshot, myGym: a free Apple ID has no App Group) and the App Group file when
 * the signing allows one, which the widget extension reads (OpenGymWidgets), and a nudge to WidgetKit
 * to draw them again. The page only writes when something the widgets show changed.
 */
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "drainActions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
    ]

    static let fileName = "widget.json"
    /// myGym diagnostics (status): the size of the last snapshot written, when, and whether the App Group took it.
    private static var lastBytes = 0
    private static var lastAt: Date?
    private static var lastAppGroup = false

    @objc func write(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), let data = json.data(using: .utf8) else {
            call.reject("json is required")
            return
        }
        // myGym: the App Group when the signing allows one, and always the shared keychain item (SharedSnapshot).
        var saved = SharedSnapshot.write(data)
        var inGroup = false
        if let dir = OpenGymGroup.container,
           (try? data.write(to: dir.appendingPathComponent(WidgetBridgePlugin.fileName), options: .atomic)) != nil {
            saved = true
            inGroup = true
        }
        WidgetBridgePlugin.lastAppGroup = inGroup
        if saved {
            WidgetBridgePlugin.lastBytes = data.count
            WidgetBridgePlugin.lastAt = Date()
            WidgetCenter.shared.reloadAllTimelines()
            call.resolve()
        } else {
            let group = SharedSnapshot.group == nil ? "no keychain group" : "keychain \(SharedSnapshot.lastWriteStatus.map { String($0) } ?? "?")"
            call.reject("could not write the widget data (\(group))")
        }
    }

    /// myGym: where the widget data stands, for Settings → Look & Home → Widgets (lib/widget-status.js):
    /// the keychain group in use and where it came from, the OSStatus of the last write and of a fresh
    /// read-back, whether the App Group exists, and the size and time of the last snapshot written.
    @objc func status(_ call: CAPPluginCall) {
        let group = SharedSnapshot.group
        let (data, readStatus) = SharedSnapshot.readWithStatus(account: SharedSnapshot.account)
        var out: [String: Any] = [
            "keychainRead": Int(readStatus),
            "readBytes": data?.count ?? 0,
            "appGroup": OpenGymGroup.container != nil,
            "lastAppGroup": WidgetBridgePlugin.lastAppGroup,
            "bytes": WidgetBridgePlugin.lastBytes,
        ]
        if let g = group { out["group"] = g }
        if let src = SharedSnapshot.groupSource { out["groupSource"] = src }
        if let p = SharedSnapshot.probeStatus { out["probe"] = Int(p) }
        if let w = SharedSnapshot.lastWriteStatus { out["keychainWrite"] = Int(w) }
        if let at = WidgetBridgePlugin.lastAt { out["at"] = at.timeIntervalSince1970 * 1000 }
        if let plist = Bundle.main.object(forInfoDictionaryKey: "AppIdentifierPrefix") as? String { out["plistPrefix"] = plist }
        call.resolve(out)
    }

    /// myGym: the widget buttons' taps (WidgetActionQueue), handed to the page and cleared here. The page
    /// keeps any it could not send yet itself (lib/widget-actions.js), so nothing is lost on a failed post.
    @objc func drainActions(_ call: CAPPluginCall) {
        let list = WidgetActionQueue.drain()
        let json: String
        if let data = try? JSONSerialization.data(withJSONObject: list), let s = String(data: data, encoding: .utf8) {
            json = s
        } else {
            json = "[]"
        }
        call.resolve(["json": json])
    }
}
