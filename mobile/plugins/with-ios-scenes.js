// iOS 27 asserts at launch unless the app adopts the scene-based life cycle (apps built with the
// iOS 27 SDK close right away with "<app> falló"). Expo 57 ships ExpoAppSceneDelegate for this, but
// its prebuild template still starts React Native from the app delegate, so this plugin:
//  - declares the scene manifest in Info.plist with our SceneDelegate,
//  - makes AppDelegate an ExpoReactNativeFactoryProvider and lets the scene create the window,
//  - adds `class SceneDelegate: ExpoAppSceneDelegate {}`.
const { withAppDelegate, withInfoPlist } = require("expo/config-plugins");

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return cfg;
  });
}

function withSceneDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== "swift") {
      throw new Error("with-ios-scenes: expected a Swift AppDelegate");
    }
    let src = cfg.modResults.contents;
    if (src.includes("ExpoAppSceneDelegate")) return cfg;

    const before = src;
    src = src.replace("class AppDelegate: ExpoAppDelegate {", "class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {");
    // the scene delegate creates the window and starts React Native in it
    src = src.replace(/#if os\(iOS\) \|\| os\(tvOS\)\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)[\s\S]*?#endif\n/, "");
    if (src === before || src.includes("UIWindow(frame:") || !src.includes("ExpoReactNativeFactoryProvider")) {
      throw new Error("with-ios-scenes: the AppDelegate template changed; update this plugin");
    }
    src += "\n// Scene-based life cycle (required by iOS 27): creates the window and starts React Native.\nclass SceneDelegate: ExpoAppSceneDelegate {}\n";
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = (config) => withSceneDelegate(withSceneManifest(config));
