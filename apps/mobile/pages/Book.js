// apps/mobile/pages/Book.js
// The plant book: every published species from A to Z, like a small dictionary. Saved on
// the phone whenever the app is connected, so it opens in the field with no signal.
import React, { useState } from 'react';
import { View, Pressable } from 'react-native';

import { usePlantBook } from '../../shared/plantBook.js';
import { bookLetters, bookName } from '../../shared/selectors.js';
import { fuzzyMatch } from '../../shared/fuzzy.js';
import { useTheme } from '../components/Theme.js';
import { Screen, Header, IconButton, TitleBlock, SearchField, Section, Txt, Sci, Chip, Empty } from '../components/Bits.js';
import { longDate } from '../components/format.js';

export default function Book({ nav }) {
  const { c } = useTheme();
  const { entries, offline, savedAt } = usePlantBook();
  const [q, setQ] = useState('');
  const shown = entries.filter((e) => fuzzyMatch(`${bookName(e)} ${e.scientific_name} ${e.family || ''} ${e.genus || ''}`.toLowerCase(), q));
  const note = !offline ? 'Saved on this phone for when there is no signal. Photos need a connection.'
    : savedAt ? `No connection: showing the copy saved on ${longDate(savedAt)}.`
    : 'No connection, and no copy is saved on this phone yet. Connect once to save it.';

  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={16}>
      <TitleBlock title="Plant book" sub={`${entries.length} species from A to Z`} />
      <Txt v="caption" color={c.ink2}>{note}</Txt>
      <SearchField value={q} onChangeText={setQ} placeholder="Search the plant book" />
      {shown.length === 0 ? <Empty icon="book">{entries.length ? 'No species match.' : 'The plant book is empty for now.'}</Empty> : null}
      {bookLetters(shown).map(({ letter, entries: list }) => (
        <Section key={letter} title={letter} gap={0}>
          {list.map((e, i) => (
            <Pressable key={e.id} accessibilityRole="button" onPress={() => nav.go('species', { id: e.id })}
              style={{ gap: 4, paddingVertical: 12, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
              <Txt v="label" style={{ fontSize: 16 }}>{bookName(e)}</Txt>
              <Sci size={14}>{e.scientific_name}</Sci>
              {e.family ? <Txt v="caption" color={c.ink2}>{e.family}{e.genus ? ` · ${e.genus}` : ''}</Txt> : null}
              {e.conservation_status ? <View style={{ flexDirection: 'row', paddingTop: 2 }}><Chip status={e.conservation_status} /></View> : null}
              {e.description ? <Txt v="body" style={{ fontSize: 15, lineHeight: 22 }}>{e.description}</Txt> : null}
              {e.cultural_significance ? <Txt v="body" color={c.ink2} style={{ fontSize: 15, lineHeight: 22 }}>Cultural note: {e.cultural_significance}</Txt> : null}
              {e.updated_at ? <Txt v="caption" color={c.ink3}>Last updated {longDate(e.updated_at)}</Txt> : null}
            </Pressable>
          ))}
        </Section>
      ))}
    </Screen>
  );
}
