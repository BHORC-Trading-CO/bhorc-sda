import "./dataDir";
import "./components/Functions/installConsoleRedaction";
import application from "./components/application/application";
import { installRendererEgress } from "./components/application/rendererEgress";
import { getAppEntries } from "./components/application/appEntries";
import registerImageListeners from "./components/Images/imageListeners";

installRendererEgress(getAppEntries());
registerImageListeners();
application.firstStage(()=>{
  console.log('started!');
});
