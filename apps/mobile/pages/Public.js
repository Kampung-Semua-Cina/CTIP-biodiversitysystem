// apps/mobile/pages/Public.js
// Screens anyone can open: Home, More, About, Contact, and the "no access" fallback.
import React, { useState } from 'react';
import { View, Linking } from 'react-native';

import { useStore } from '../../shared/store.js';
import { visiblePlants, speciesCatalogue } from '../../shared/selectors.js';
import { fuzzyMatch } from '../../shared/fuzzy.js';
import { getAboutContent, getContactContent, getHomeContent } from '../../shared/publicContent.js';
import { SITE, PARK } from '../../shared/site.js';
import { useTheme } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import { LogoMark, AppearanceSection, VersionLine } from '../components/Chrome.js';
import {
  Screen, Header, TitleBlock, SearchField, Section, Row, Thumb, Sci, DotLabel, TextLink, Txt,
  MenuRow, Button, KV, IconTile, IconButton, Empty,
} from '../components/Bits.js';

// Newest published plants first (the date an officer approved them), or published species
function recentPublished(db) {
  const approvedAt = (plant) => {
    const obs = (db.observations || []).filter((o) => o.specimen_id === plant.id && o.status === 'approved');
    const rev = (db.reviews || []).filter((r) => obs.some((o) => o.id === r.observation_id));
    return rev.map((r) => r.created_at).sort().pop() || obs[0]?.observed_at || plant.created_at || '';
  };
  const plants = visiblePlants(db, 'visitor').sort((a, b) => approvedAt(b).localeCompare(approvedAt(a)));
  if (plants.length > 0) return plants;

  return speciesCatalogue(db, 'visitor')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .map((s) => ({
      id: s.id,
      name: s.common_name || s.name || s.scientific_name,
      scientific: s.scientific_name,
      endangered: s.endangered,
      photos: s.photo ? [{ url: s.photo }] : (s.media?.length ? [{ url: s.media[0].url }] : []),
      species: s,
    }));
}

export function Home({ nav }) {
  const { db } = useStore();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const recent = recentPublished(db).slice(0, 6);
  const home = getHomeContent(PARK);

  return (
    <Screen
      header={
        <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 8 }}>
          <LogoMark />
          <TextLink label="Sign in" onPress={() => nav.go('signin')} />
        </View>
      }
      top={4}
    >
      <TitleBlock title="Plants of Niah" sub={`Verified records from ${PARK}`} size={34} />
      <SearchField
        value={q}
        onChangeText={(text) => {
          setQ(text);
          if (text.length > 1) nav.go('plants', { q: text });
        }}
        placeholder="Search plants or tag ID"
      />
      <Section title={home.recentSectionTitle} top={false} gap={0} right={<TextLink label="See all" size={14} onPress={() => nav.tab('plants')} />}>
        {recent.length === 0 ? <Empty>No published plants or species yet.</Empty> : null}
        {recent.map((p, i) => (
          <Row
            key={p.id}
            left={<Thumb uri={p.photos?.[0]?.url || p.photo} />}
            title={p.name}
            sub={
              <>
                <Sci size={14}>{p.scientific || p.scientific_name}</Sci>
                {p.endangered ? <DotLabel status="endangered" /> : null}
              </>
            }
            onPress={() => {
              if (p.qr_id) nav.go('tag', { qr: p.qr_id });
              else if (p.species?.id || p.id) nav.go('species', { id: p.species?.id || p.id });
              else nav.tab('plants');
            }}
            last={i === recent.length - 1}
          />
        ))}
      </Section>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Icon name="lock" size={16} color={c.ink2} />
        <Txt v="caption" color={c.ink2} style={{ flex: 1, fontWeight: undefined }}>Endangered plants never show an exact location.</Txt>
      </View>
    </Screen>
  );
}

// Visitor "More" tab.
export function More({ nav }) {
  const { c } = useTheme();
  return (
    <Screen gap={20}>
      <TitleBlock title="More" />
      <View>
        <MenuRow icon="book" label="Plant book" onPress={() => nav.go('book')} />
        <MenuRow icon="info" label={`About ${SITE}`} onPress={() => nav.go('about')} />
        <MenuRow icon="mail" label="Contact" onPress={() => nav.go('contact')} last />
      </View>
      <AppearanceSection />
      <Section title="Park staff" gap={12}>
        <Txt v="body" color={c.ink2} style={{ fontSize: 15, lineHeight: 22 }}>
          For Sarawak Forestry Corporation botanists, officers and admins.
        </Txt>
        <Button label="Staff sign in" kind="secondary" icon="lock" onPress={() => nav.go('signin')} />
      </Section>
      <VersionLine />
    </Screen>
  );
}

export function About({ nav }) {
  const { c } = useTheme();
  const about = getAboutContent(SITE, PARK);
  const features = getHomeContent(PARK).features;
  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={18}>
      <TitleBlock title={about.title} />
      {about.paragraphs.map((p) => (
        <Txt key={p.slice(0, 20)} v="body" style={{ lineHeight: 25 }}>{p}</Txt>
      ))}
      <View>
        {features.map((f, i) => (
          <View key={f.title} style={{ flexDirection: 'row', gap: 14, paddingVertical: 14, borderBottomWidth: i < features.length - 1 ? 1 : 0, borderBottomColor: c.line }}>
            <IconTile name={f.icon} />
            <View style={{ flex: 1, gap: 2 }}>
              <Txt v="label" style={{ fontSize: 16 }}>{f.title}</Txt>
              <Txt v="body" color={c.ink2} style={{ fontSize: 15, lineHeight: 22 }}>{f.text}</Txt>
            </View>
          </View>
        ))}
      </View>
    </Screen>
  );
}

export function Contact({ nav }) {
  const info = getContactContent();
  return (
    <Screen header={<Header left={<IconButton name="chevL" label="Back" onPress={nav.back} />} />} top={0} gap={18}>
      <TitleBlock title={info.title} />
      <KV rows={[['Organisation', info.organization], ['Address', info.address], ['Email', info.email]]} />
      <Button label="Email us" icon="mail" onPress={() => Linking.openURL(`mailto:${info.email}`)} />
    </Screen>
  );
}

export function NoAccess({ nav }) {
  const { role } = useStore();
  return (
    <Screen header={<Header left={nav.canGoBack ? <IconButton name="chevL" label="Back" onPress={nav.back} /> : null} />} top={0}>
      <Empty icon="lock">
        {role === 'visitor' ? 'This page is for staff. Sign in to continue.' : 'Your role does not include this page.'}
      </Empty>
      {role === 'visitor' ? <Button label="Staff sign in" onPress={() => nav.go('signin')} /> : null}
    </Screen>
  );
}
