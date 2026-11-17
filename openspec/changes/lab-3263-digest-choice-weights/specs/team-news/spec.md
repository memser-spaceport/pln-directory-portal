## REMOVED Requirements

### Requirement: Muted news tags

**Reason**: SU Nov 16 (Vova, Anuj): "More like this" / "Less like this" must not change the tags a member selected. They change interest profile weights instead (`labos-digest-page`).
**Migration**: None. The first version never reached prod. A `newsTagsMuted` key stored on dev is ignored.

### Requirement: Digest tag picks skip muted tags

**Reason**: There are no muted tags any more. A Less choice lowers topic weights instead of hiding stories.
**Migration**: None. Digest tag picks are as before LAB-3263.
