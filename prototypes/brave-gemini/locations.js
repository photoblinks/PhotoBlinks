// The only locations this prototype ever processes. Fixed in code: no database read.
// officialHosts = this place's own official sites (e.g. its district NIC site). A wrong or
// missing entry only makes the source policy stricter (that host is rejected); it never widens it.
// Mapping audit: kodagu.nic.in, ernakulam.nic.in, vijayanagara.nic.in and idukki.nic.in were
// confirmed as the districts' official sites; dtpcidukki.com is the District Tourism Promotion
// Council Idukki's official site (it has a Munnar destination page). coorg.nic.in was seen in real pilot grounding
// results (Kodagu district) but is not independently confirmed. Hampi is in Vijayanagara
// district (not Ballari). Bangalore Palace has no confirmed official host beyond the state
// tourism site, so it lists none; unconfirmed venue sites (e.g. bangalorepalace.in) are NOT
// allowed.
const LOCATIONS = Object.freeze([
  { name: 'Bangalore Palace Grounds', city_name: 'Bengaluru', state_name: 'Karnataka', officialHosts: [] },
  { name: 'Coorg Coffee Plantation', city_name: 'Madikeri', state_name: 'Karnataka', officialHosts: ['coorg.nic.in', 'kodagu.nic.in'],
    // Search wording that pulls official pages (not blogs): the district's other name and its authorities.
    search: { aliases: ['Kodagu'], authorities: ['Karnataka Tourism', 'Kodagu district administration', 'KSTDC'] } },
  { name: 'Fort Kochi', city_name: 'Kochi', state_name: 'Kerala', officialHosts: ['ernakulam.nic.in'] },
  { name: 'Hampi Heritage Site', city_name: 'Hampi', state_name: 'Karnataka', officialHosts: ['vijayanagara.nic.in'] },
  { name: 'Munnar Tea Gardens', city_name: 'Munnar', state_name: 'Kerala', officialHosts: ['idukki.nic.in', 'dtpcidukki.com'],
    search: { aliases: ['Idukki'], authorities: ['Kerala Tourism', 'DTPC Idukki', 'Idukki district administration'] } },
]);

module.exports = { LOCATIONS };
