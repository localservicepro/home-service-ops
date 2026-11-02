// Website enquiry form embed script.
// Usage: <script src="<API_URL>/embed" data-hso-form="FORM_KEY" async></script>
// The form itself is a page of the web app (APP_URL/f/<key>), shown in an iframe.
import { APP_URL } from "../helpers/serverEnv";
const SCRIPT = () => `(function () {
  var scripts = document.querySelectorAll("script[data-hso-form]");
  for (var i = 0; i < scripts.length; i++) {
    var s = scripts[i];
    if (s.getAttribute("data-hso-mounted")) continue;
    s.setAttribute("data-hso-mounted", "1");
    var key = s.getAttribute("data-hso-form");
    if (!key) continue;
    var origin = ${JSON.stringify(APP_URL)};
    var frame = document.createElement("iframe");
    frame.src = origin + "/f/" + encodeURIComponent(key) + "?embed=1";
    frame.title = "Request a quote";
    frame.setAttribute("allow", "camera");
    frame.style.cssText = "width:100%;max-width:680px;height:780px;border:0;display:block;margin:0 auto;background:transparent;overflow:hidden";
    s.parentNode.insertBefore(frame, s.nextSibling);
    (function (frame, key, origin) {
      window.addEventListener("message", function (e) {
        if (e.origin !== origin || !e.data || e.data.type !== "hso-form-height" || e.data.key !== key) return;
        var h = Number(e.data.height);
        if (h > 100 && h < 5000) frame.style.height = (h + 4) + "px";
      });
    })(frame, key, origin);
  }
})();`;

export async function handle() {
  return new Response(SCRIPT(), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
