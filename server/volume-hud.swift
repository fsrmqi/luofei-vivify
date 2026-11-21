import AppKit
import CoreGraphics
import IOKit.hidsystem

guard CommandLine.arguments.count == 2, CGPreflightPostEventAccess() else { exit(2) }
let direction = CommandLine.arguments[1]
if direction == "check" { exit(0) }
guard direction == "up" || direction == "down" else { exit(2) }
let key = Int(direction == "up" ? NX_KEYTYPE_SOUND_UP : NX_KEYTYPE_SOUND_DOWN)
let fineStep: NSEvent.ModifierFlags = [.shift, .option]

let events = [0xA, 0xB].compactMap { phase in
    NSEvent.otherEvent(
        with: .systemDefined,
        location: .zero,
        modifierFlags: NSEvent.ModifierFlags(rawValue: fineStep.rawValue | UInt(phase << 8)),
        timestamp: 0,
        windowNumber: 0,
        context: nil,
        subtype: 8,
        data1: (key << 16) | (phase << 8),
        data2: -1
    )?.cgEvent
}
guard events.count == 2 else { exit(2) }
for event in events { event.post(tap: .cghidEventTap) }
// 保持发送进程存活，等 WindowServer 消费已排队的媒体键事件。
Thread.sleep(forTimeInterval: 0.12)
