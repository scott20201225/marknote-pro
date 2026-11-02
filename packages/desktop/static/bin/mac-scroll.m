#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

#define FIELD_SCROLL_PHASE 99
#define FIELD_IS_CONTINUOUS 88

int main(int argc, char *argv[]) {
    @autoreleasepool {
        int totalDelta = -220;
        if (argc > 1) {
            int val = atoi(argv[1]);
            if (val != 0) {
                totalDelta = (abs(val) < 50) ? (val * 18) : val;
            }
        }

        CGPoint targetPt = CGPointMake(500, 500);
        if (argc >= 4) {
            targetPt.x = atof(argv[2]);
            targetPt.y = atof(argv[3]);
        } else {
            CGEventRef cur = CGEventCreate(NULL);
            if (cur) {
                targetPt = CGEventGetLocation(cur);
                CFRelease(cur);
            }
        }

        pid_t excludePid = 0;
        if (argc >= 5) {
            excludePid = atoi(argv[4]);
        }

        pid_t selfPid = getpid();
        pid_t parentPid = getppid();

        CFArrayRef windowList = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
        if (!windowList) return 1;

        pid_t targetPid = 0;
        char targetName[256] = {0};

        CFIndex count = CFArrayGetCount(windowList);
        for (CFIndex i = 0; i < count; i++) {
            CFDictionaryRef info = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);
            CFNumberRef pidRef = (CFNumberRef)CFDictionaryGetValue(info, kCGWindowOwnerPID);
            CFStringRef nameRef = (CFStringRef)CFDictionaryGetValue(info, kCGWindowOwnerName);
            CFNumberRef layerRef = (CFNumberRef)CFDictionaryGetValue(info, kCGWindowLayer);
            CFDictionaryRef boundsRef = (CFDictionaryRef)CFDictionaryGetValue(info, kCGWindowBounds);

            int layer = -1;
            if (layerRef) CFNumberGetValue(layerRef, kCFNumberIntType, &layer);
            if (layer != 0) continue; // Only actual user application windows (layer 0)

            CGRect bounds;
            if (boundsRef && CGRectMakeWithDictionaryRepresentation(boundsRef, &bounds)) {
                if (CGRectContainsPoint(bounds, targetPt)) {
                    pid_t pid = 0;
                    if (pidRef) CFNumberGetValue(pidRef, kCFNumberIntType, &pid);
                    if (pid == selfPid || pid == parentPid || (excludePid > 0 && pid == excludePid)) {
                        continue;
                    }

                    char name[256] = {0};
                    if (nameRef) CFStringGetCString(nameRef, name, sizeof(name), kCFStringEncodingUTF8);

                    if (strcmp(name, "程序坞") == 0 || strcmp(name, "Dock") == 0 ||
                        strcmp(name, "Window Server") == 0 || strcmp(name, "Control Center") == 0 ||
                        strcmp(name, "Notification Center") == 0 ||
                        strcmp(name, "MarkNotePro") == 0 || strcmp(name, "Electron") == 0) {
                        continue;
                    }

                    targetPid = pid;
                    strncpy(targetName, name, sizeof(targetName) - 1);
                    break;
                }
            }
        }
        CFRelease(windowList);

        if (targetPid > 0) {
            // 1. Activate target application so that inactive views accept scroll input
            NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:targetPid];
            if (app) {
                [app activateWithOptions:0];
            }
            usleep(15000); // 15ms for activation

            CGEventSourceRef src = CGEventSourceCreate(kCGEventSourceStateCombinedSessionState);

            // 2. Mouse move hover event at target point
            CGEventRef moveEv = CGEventCreateMouseEvent(src, kCGEventMouseMoved, targetPt, kCGMouseButtonLeft);
            if (moveEv) {
                CGEventSetLocation(moveEv, targetPt);
                CGEventPostToPid(targetPid, moveEv);
                CGEventPost(kCGHIDEventTap, moveEv);
                CFRelease(moveEv);
            }
            usleep(10000);

            // 3. Natural Multi-Step Trackpad Gesture:
            // Step A: Began
            int part1 = totalDelta / 6;
            CGEventRef evBegan = CGEventCreateScrollWheelEvent2(src, kCGScrollEventUnitPixel, 1, part1, 0, 0);
            if (evBegan) {
                CGEventSetLocation(evBegan, targetPt);
                CGEventSetIntegerValueField(evBegan, (CGEventField)FIELD_SCROLL_PHASE, 1); // Began
                CGEventSetIntegerValueField(evBegan, (CGEventField)FIELD_IS_CONTINUOUS, 1);
                CGEventPostToPid(targetPid, evBegan);
                CGEventPost(kCGHIDEventTap, evBegan);
                CFRelease(evBegan);
            }
            usleep(8000);

            // Step B: Changed 1
            int part2 = totalDelta / 3;
            CGEventRef evChg1 = CGEventCreateScrollWheelEvent2(src, kCGScrollEventUnitPixel, 1, part2, 0, 0);
            if (evChg1) {
                CGEventSetLocation(evChg1, targetPt);
                CGEventSetIntegerValueField(evChg1, (CGEventField)FIELD_SCROLL_PHASE, 2); // Changed
                CGEventSetIntegerValueField(evChg1, (CGEventField)FIELD_IS_CONTINUOUS, 1);
                CGEventPostToPid(targetPid, evChg1);
                CGEventPost(kCGHIDEventTap, evChg1);
                CFRelease(evChg1);
            }
            usleep(8000);

            // Step C: Changed 2
            int part3 = totalDelta - part1 - part2;
            CGEventRef evChg2 = CGEventCreateScrollWheelEvent2(src, kCGScrollEventUnitPixel, 1, part3, 0, 0);
            if (evChg2) {
                CGEventSetLocation(evChg2, targetPt);
                CGEventSetIntegerValueField(evChg2, (CGEventField)FIELD_SCROLL_PHASE, 2); // Changed
                CGEventSetIntegerValueField(evChg2, (CGEventField)FIELD_IS_CONTINUOUS, 1);
                CGEventPostToPid(targetPid, evChg2);
                CGEventPost(kCGHIDEventTap, evChg2);
                CFRelease(evChg2);
            }
            usleep(8000);

            // Step D: Ended
            CGEventRef evEnded = CGEventCreateScrollWheelEvent2(src, kCGScrollEventUnitPixel, 1, 0, 0, 0);
            if (evEnded) {
                CGEventSetLocation(evEnded, targetPt);
                CGEventSetIntegerValueField(evEnded, (CGEventField)FIELD_SCROLL_PHASE, 4); // Ended
                CGEventSetIntegerValueField(evEnded, (CGEventField)FIELD_IS_CONTINUOUS, 1);
                CGEventPostToPid(targetPid, evEnded);
                CGEventPost(kCGHIDEventTap, evEnded);
                CFRelease(evEnded);
            }

            // 4. Line scroll fallback for legacy AppKit / Terminal / Finder views
            int lineDelta = (totalDelta < 0) ? -8 : 8;
            CGEventRef evLine = CGEventCreateScrollWheelEvent2(src, kCGScrollEventUnitLine, 1, lineDelta, 0, 0);
            if (evLine) {
                CGEventSetLocation(evLine, targetPt);
                CGEventPostToPid(targetPid, evLine);
                CGEventPost(kCGHIDEventTap, evLine);
                CFRelease(evLine);
            }

            if (src) CFRelease(src);
            usleep(25000);
        } else {
            // Fallback if no target PID found: post directly to HID
            CGEventRef scrollEvent = CGEventCreateScrollWheelEvent(NULL, kCGScrollEventUnitLine, 1, (totalDelta < 0 ? -8 : 8));
            if (scrollEvent) {
                CGEventSetLocation(scrollEvent, targetPt);
                CGEventPost(kCGHIDEventTap, scrollEvent);
                CFRelease(scrollEvent);
            }
        }
    }
    return 0;
}
