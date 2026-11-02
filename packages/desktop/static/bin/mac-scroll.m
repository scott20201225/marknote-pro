#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>

static void printWindowListJSON(void) {
    CFArrayRef windowList = CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID);
    if (!windowList) {
        printf("[]\n");
        return;
    }

    CFIndex count = CFArrayGetCount(windowList);
    printf("[");
    BOOL first = YES;
    for (CFIndex i = 0; i < count; i++) {
        CFDictionaryRef info = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, i);
        CFNumberRef layerRef = (CFNumberRef)CFDictionaryGetValue(info, kCGWindowLayer);
        int layer = -1;
        if (layerRef) CFNumberGetValue(layerRef, kCFNumberIntType, &layer);
        if (layer != 0 && layer != 3 && layer != 5 && layer != 8) continue; // standard windows and dialogs

        CFNumberRef alphaRef = (CFNumberRef)CFDictionaryGetValue(info, kCGWindowAlpha);
        float alpha = 1.0f;
        if (alphaRef) CFNumberGetValue(alphaRef, kCFNumberFloatType, &alpha);
        if (alpha <= 0.05f) continue;

        CFDictionaryRef boundsRef = (CFDictionaryRef)CFDictionaryGetValue(info, kCGWindowBounds);
        CGRect bounds;
        if (boundsRef && CGRectMakeWithDictionaryRepresentation(boundsRef, &bounds)) {
            if (bounds.size.width < 80 || bounds.size.height < 60) continue;

            CFStringRef ownerRef = (CFStringRef)CFDictionaryGetValue(info, kCGWindowOwnerName);
            CFStringRef nameRef = (CFStringRef)CFDictionaryGetValue(info, kCGWindowName);
            char owner[256] = {0};
            char name[256] = {0};
            if (ownerRef) CFStringGetCString(ownerRef, owner, sizeof(owner), kCFStringEncodingUTF8);
            if (nameRef) CFStringGetCString(nameRef, name, sizeof(name), kCFStringEncodingUTF8);

            // Only filter out macOS system overlays, NOT applications!
            if (strcmp(owner, "Dock") == 0 ||
                strcmp(owner, "Window Server") == 0 || strcmp(owner, "Notification Center") == 0 ||
                strcmp(owner, "Control Center") == 0 || strcmp(owner, "Spotlight") == 0) {
                continue;
            }

            for (int k = 0; owner[k]; k++) {
                if (owner[k] == '"' || owner[k] == '\\') owner[k] = ' ';
            }
            for (int k = 0; name[k]; k++) {
                if (name[k] == '"' || name[k] == '\\') name[k] = ' ';
            }

            CFNumberRef pidRef = (CFNumberRef)CFDictionaryGetValue(info, kCGWindowOwnerPID);
            int winPid = 0;
            if (pidRef) CFNumberGetValue(pidRef, kCFNumberIntType, &winPid);

            if (!first) printf(",");
            printf("{\"pid\":%d,\"x\":%.0f,\"y\":%.0f,\"w\":%.0f,\"h\":%.0f,\"owner\":\"%s\",\"title\":\"%s\"}",
                   winPid, bounds.origin.x, bounds.origin.y, bounds.size.width, bounds.size.height, owner, name);
            first = NO;
        }
    }
    printf("]\n");
    CFRelease(windowList);
}

int main(int argc, char *argv[]) {
    @autoreleasepool {
        printWindowListJSON();
    }
    return 0;
}
