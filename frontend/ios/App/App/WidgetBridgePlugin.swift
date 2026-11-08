import Capacitor
import Foundation
import WidgetKit

/**
 * Hands the Home Screen and Lock Screen widgets what they show (lib/widgets.js builds it): a small
 * JSON file in the App Group, which the widget extension reads (OpenGymWidgets), and a nudge to
 * WidgetKit to draw them again. The page only writes when something the widgets show changed.
 */
@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "WidgetBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "write", returnType: CAPPluginReturnPromise),
    ]

    static let fileName = "widget.json"

    @objc func write(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), let data = json.data(using: .utf8) else {
            call.reject("json is required")
            return
        }
        // myGym: the App Group when the signing allows one, and always the shared keychain item (SharedSnapshot).
        var saved = SharedSnapshot.write(data)
        if let dir = OpenGymGroup.container,
           (try? data.write(to: dir.appendingPathComponent(WidgetBridgePlugin.fileName), options: .atomic)) != nil {
            saved = true
        }
        if saved {
            WidgetCenter.shared.reloadAllTimelines()
            call.resolve()
        } else {
            call.reject("could not write the widget data")
        }
    }
}
