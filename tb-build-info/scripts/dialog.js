/* eslint-env browser, es6 */
/* global VSS */
const getParams = query => {
  if (!query) {
    return { };
  }

  return (/^[?#]/.test(query) ? query.slice(1) : query)
    .split('&')
    .reduce((params, param) => {
      let [key, value] = param.split('=');
      params[key] = value ? decodeURIComponent(value.replace(/\+/g, ' ')) : '';
      return params;
    }, { });
};
// Only ever frame an https TestingBot URL. The url comes in as a query
// parameter, so validate it before assigning it as the iframe source to avoid
// framing an attacker-supplied page.
const isAllowedUrl = value => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' &&
      (parsed.hostname === 'testingbot.com' || parsed.hostname.endsWith('.testingbot.com'));
  } catch (err) {
    return false;
  }
};

const params = getParams(window.location.search);
if (isAllowedUrl(params.url)) {
  var iframe = document.createElement('iframe');
  iframe.src = params.url;
  iframe.style = 'width: 100%; min-height: 100vh; border: 0';
  document.body.appendChild(iframe);
} else {
  document.body.textContent = 'Unable to display this test: the requested URL is not a valid TestingBot address.';
}