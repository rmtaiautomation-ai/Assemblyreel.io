// Pure audit of private exports. IDs stay in the local report, not console output.
const normalize = value => String(value ?? '').trim().toLowerCase();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const index = rows => new Map(rows.map(row => [normalize(row.id), row]));

export function auditOwnership(tables, identities, objects, schema) {
  const workspaces = index(tables.workspaces);
  const projects = index(tables.video_projects);
  const profiles = index(tables.users);
  const auth = index(identities);
  const media = index(tables.media);
  const issues = {};
  const record = (name, rows) => { issues[name] = rows.map(row => row.id); };
  record('ownerless_workspaces', tables.workspaces.filter(row => row.user_id === null));
  record('workspaces_missing_profile', tables.workspaces.filter(row => row.user_id !== null && !profiles.has(normalize(row.user_id))));
  record('profiles_missing_auth', tables.users.filter(row => !auth.has(normalize(row.id))));
  record('auth_missing_profile', identities.filter(row => !profiles.has(normalize(row.id))));
  record('profile_email_mismatch', tables.users.filter(row => auth.has(normalize(row.id)) && row.email !== auth.get(normalize(row.id)).email));
  record('orphan_projects', tables.video_projects.filter(row => !workspaces.has(normalize(row.workspace_id))));
  record('orphan_channel_facts', tables.channel_facts.filter(row => !workspaces.has(normalize(row.workspace_id))));
  for (const name of ['scenes','media','timeline_items','overlay_clips','act_narrations']) {
    record(`orphan_${name}`, tables[name].filter(row => !projects.has(normalize(row.project_id))));
    record(`malformed_${name}_project_id`, tables[name].filter(row => !uuid.test(String(row.project_id ?? '').trim())));
    record(`noncanonical_${name}_project_id`, tables[name].filter(row => String(row.project_id) !== normalize(row.project_id)));
  }
  for (const name of ['scenes','timeline_items']) {
    const linked = tables[name].filter(row => row.media_id !== null && row.media_id !== undefined);
    record(`${name}_missing_media`, linked.filter(row => !media.has(normalize(row.media_id))));
    record(`${name}_cross_project_media`, linked.filter(row => media.has(normalize(row.media_id)) && normalize(row.project_id) !== normalize(media.get(normalize(row.media_id)).project_id)));
  }
  const mapping = tables.workspaces.map(row => ({
    workspaceId: row.id, currentOwnerId: row.user_id,
    disposition: row.user_id === null ? 'quarantined_pending_explicit_owner' :
      profiles.has(normalize(row.user_id)) && auth.has(normalize(row.user_id)) ? 'preserve_recorded_owner' : 'quarantined_missing_identity',
    projectIds: tables.video_projects.filter(project => normalize(project.workspace_id) === normalize(row.id)).map(project => project.id),
  }));
  const storageIndex = new Set(objects.map(object => `${object.bucket}/${object.name}`));
  const candidateKeys = name => objects.filter(object => object.name === name).map(object => `${object.bucket}/${object.name}`);
  const references = [];
  // Inventory URL-valued fields, including nested JSON; never fetch external URLs.
  function visit(value, table, rowId, field) {
    if (Array.isArray(value)) return value.forEach((item, i) => visit(item, table, rowId, `${field}[${i}]`));
    if (value && typeof value === 'object') return Object.entries(value).forEach(([key,item]) => visit(item, table, rowId, `${field}.${key}`));
    if (typeof value !== 'string') return;
    if (/^https?:\/\//.test(value)) {
      let url;
      try { url = new URL(value); } catch { return; }
      const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
      if (match && url.hostname === schema.host) {
        let key;
        try { key = `${decodeURIComponent(match[1])}/${decodeURIComponent(match[2])}`; } catch { return; }
        references.push({table,rowId,field,kind:'project_storage',key,exists:storageIndex.has(key)});
      } else references.push({table,rowId,field,kind:'external_url',host:url.hostname});
    } else if (/^\/(?:audio|media)\//.test(value)) {
      references.push({table,rowId,field,kind:'legacy_local_path',candidateStorageKeys:candidateKeys(value.slice(1))});
    } else if (field.endsWith('.storage_path') && value) {
      references.push({table,rowId,field,kind:'storage_path',candidateStorageKeys:
        storageIndex.has(value) ? [value] : candidateKeys(value)});
    }
  }
  for (const [name, rows] of Object.entries(tables)) {
    for (const row of rows) visit(row,name,row.id,'');
  }
  const referencedObjects = new Set(references.flatMap(ref => ref.key ? [ref.key] : ref.candidateStorageKeys ?? []));
  return {
    counts: Object.fromEntries(Object.entries(tables).map(([name,rows]) => [name,rows.length])),
    authAccounts: identities.length,
    confirmedAccounts: identities.filter(user => user.email_confirmed_at).length,
    issues: Object.fromEntries(Object.entries(issues).map(([name,ids]) => [name,ids.length])),
    issueIds: issues, ownershipMapping: mapping,
    sceneProjectReferenceType: schema.definitions.scenes.properties.project_id.format,
    projectPrimaryKeyType: schema.definitions.video_projects.properties.id.format,
    storageReferences: references,
    storageReferenceSummary: {
      matching: references.filter(ref => ref.kind === 'project_storage' && ref.exists).length,
      missing: references.filter(ref => ref.kind === 'project_storage' && !ref.exists).length,
      external: references.filter(ref => ref.kind === 'external_url').length,
      local: references.filter(ref => ref.kind === 'legacy_local_path').length,
      localPathsWithStorageMatch: references.filter(ref => ref.kind === 'legacy_local_path' && ref.candidateStorageKeys.length).length,
      storagePathsMatched: references.filter(ref => ref.kind === 'storage_path' && ref.candidateStorageKeys.length).length,
      objectsWithoutRecognizedUrlReference: objects.filter(object => !referencedObjects.has(`${object.bucket}/${object.name}`)).length,
    },
    limitations: [
      'API schema is not a PostgreSQL catalog dump; fresh grants, RLS, indexes, constraints and trigger definitions need ownership-catalog.sql.',
      'External URLs and legacy local media paths are inventoried, not downloaded or guaranteed recoverable.',
      'URL inventory is heuristic; an object without a recognized URL reference is not proven unused.',
      'Recorded ownership is preserved as evidence; new ownership requires explicit verification, never inference from email or the sole account.',
    ],
  };
}
