/**
 * Google People API (Contacts) helpers for Rolodex ↔ Gmail Contacts sync.
 * Same OAuth refresh token as Calendar; requires contacts scopes on the token.
 */

const PEOPLE = "https://people.googleapis.com/v1";

export async function listGoogleContacts(accessToken) {
  const contacts = [];
  let pageToken = "";
  do {
    const q = new URLSearchParams({
      personFields: "names,emailAddresses,phoneNumbers,organizations,biographies,userDefined",
      pageSize: "200",
    });
    if (pageToken) q.set("pageToken", pageToken);
    const res = await fetch(`${PEOPLE}/people/me/connections?${q}`, {
      headers: { Authorization: "Bearer " + accessToken },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "People list failed");
    for (const person of data.connections || []) {
      contacts.push(personToRolodex(person));
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return contacts;
}

function personToRolodex(person) {
  const name = (person.names && person.names[0] && (person.names[0].displayName || person.names[0].givenName)) || "";
  const email = (person.emailAddresses && person.emailAddresses[0] && person.emailAddresses[0].value) || "";
  const phone = (person.phoneNumbers && person.phoneNumbers[0] && person.phoneNumbers[0].value) || "";
  const org = person.organizations && person.organizations[0];
  const company = (org && (org.name || org.title)) || "";
  const notes = (person.biographies && person.biographies[0] && person.biographies[0].value) || "";
  const caps = [];
  (person.userDefined || []).forEach((u) => {
    if (String(u.key || "").toLowerCase() === "jnh_capabilities" && u.value) {
      String(u.value)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((c) => caps.push(c));
    }
  });
  return {
    resourceName: person.resourceName || "",
    etag: person.etag || "",
    name,
    email,
    phone,
    company,
    area: "",
    notes,
    capabilities: caps,
  };
}

function rolodexToPersonBody(c) {
  const body = {
    names: [{ givenName: c.name || "Unnamed" }],
    emailAddresses: c.email ? [{ value: c.email }] : [],
    phoneNumbers: c.phone ? [{ value: c.phone }] : [],
    organizations: c.company ? [{ name: c.company }] : [],
    biographies: c.notes ? [{ value: c.notes, contentType: "TEXT_PLAIN" }] : [],
    userDefined: [
      {
        key: "jnh_capabilities",
        value: (c.capabilities || []).join(", "),
      },
      {
        key: "jnh_area",
        value: c.area || "",
      },
      {
        key: "jnh_pro_desk_id",
        value: c.id || "",
      },
    ],
  };
  return body;
}

export async function upsertGoogleContact(accessToken, c) {
  if (c.resourceName) {
    // update
    const url = `${PEOPLE}/${c.resourceName}:updateContact?updatePersonFields=names,emailAddresses,phoneNumbers,organizations,biographies,userDefined`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer " + accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...rolodexToPersonBody(c), etag: c.etag || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error?.message || "People update failed");
    return { id: c.id, resourceName: data.resourceName, etag: data.etag, action: "updated" };
  }
  const res = await fetch(`${PEOPLE}/people:createContact`, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(rolodexToPersonBody(c)),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "People create failed");
  return { id: c.id, resourceName: data.resourceName, etag: data.etag, action: "created" };
}

export async function pushContacts(accessToken, contacts) {
  const results = [];
  for (const c of contacts || []) {
    results.push(await upsertGoogleContact(accessToken, c));
  }
  return results;
}
