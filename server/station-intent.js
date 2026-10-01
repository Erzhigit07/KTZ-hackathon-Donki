export function requestedStation(question) {
  if (!/(найди|найти|покажи|показать|открой|открыть|где|отыщи)/i.test(question)) return null;
  const station = question.match(/станци(?:ю|и|я|е|ей)\s+([^?!,\n]+)/i)
    || question.match(/вокзал\s+([^?!,\n]+)/i)
    || question.match(/(?:найди|найти|покажи|показать|открой|открыть|отыщи)\s+([^?!,\n]+?)(?:\s+на карте|$)/i);
  if (!station) return null;
  const name = station[1].replace(/\s+(?:пожалуйста|на карте|в Казахстане).*$/i, '').trim();
  return name.length >= 2 && name.length <= 80 ? name : null;
}
