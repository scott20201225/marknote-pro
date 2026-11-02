#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

int main(int argc, char *argv[]) {
    int lines = -12;
    if (argc > 1) {
        lines = atoi(argv[1]);
    }

    if (argc >= 4) {
        double cx = atof(argv[2]);
        double cy = atof(argv[3]);
        CGPoint targetPt = CGPointMake(cx, cy);

        // 1. Get original mouse position
        CGEventRef getPos = CGEventCreate(NULL);
        CGPoint originalPos = targetPt;
        if (getPos) {
            originalPos = CGEventGetLocation(getPos);
            CFRelease(getPos);
        }

        // 2. Warp mouse cursor to target location inside the selected area
        CGWarpMouseCursorPosition(targetPt);
        usleep(15000); // 15ms for WindowServer hover tracking

        // 3. Post mouse moved event so target app updates hover and active scroll target
        CGEventRef moveEvent = CGEventCreateMouseEvent(NULL, kCGEventMouseMoved, targetPt, kCGMouseButtonLeft);
        if (moveEvent) {
            CGEventPost(kCGHIDEventTap, moveEvent);
            CFRelease(moveEvent);
        }
        usleep(15000); // 15ms

        // 4. Create and post scroll wheel events at targetPt
        // A. Post line scroll event (for standard Cocoa, Terminal, NSTableView, Finder)
        CGEventRef scrollEvent = CGEventCreateScrollWheelEvent2(NULL, kCGScrollEventUnitLine, 1, lines, 0, 0);
        if (scrollEvent) {
            CGEventSetLocation(scrollEvent, targetPt);
            CGEventPost(kCGHIDEventTap, scrollEvent);
            CFRelease(scrollEvent);
        }

        // B. Also post pixel scroll event (for modern apps like Lark, Chrome, Electron, web views)
        CGEventRef scrollPixelEvent = CGEventCreateScrollWheelEvent2(NULL, kCGScrollEventUnitPixel, 1, lines * 15, 0, 0);
        if (scrollPixelEvent) {
            CGEventSetLocation(scrollPixelEvent, targetPt);
            CGEventPost(kCGHIDEventTap, scrollPixelEvent);
            CFRelease(scrollPixelEvent);
        }

        usleep(40000); // 40ms to let target window process event before restoring cursor

        // 5. Restore mouse cursor position so user's cursor remains on dock / button
        CGWarpMouseCursorPosition(originalPos);
    } else {
        // Fallback: scroll at current mouse position
        CGEventRef scrollEvent = CGEventCreateScrollWheelEvent(NULL, kCGScrollEventUnitLine, 1, lines);
        if (scrollEvent) {
            CGEventPost(kCGHIDEventTap, scrollEvent);
            CFRelease(scrollEvent);
        }
    }

    return 0;
}
