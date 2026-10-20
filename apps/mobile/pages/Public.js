// apps/mobile/pages/Public.js
// Screens anyone can open: Home, More, About, Contact, and the "no access" fallback.
import React, { useState } from 'react';
import { View, Linking } from 'react-native';

import { useStore } from '../../shared/store.js';
import { visiblePlants } from '../../shared/selectors.js';
import { getAboutContent, getContactContent, getHomeContent } from '../../shared/publicContent.js';
import { SITE, PARK } from '../../shared/site.js';
import { useTheme } from '../components/Theme.js';
import Icon from '../components/Icon.js';
import { LogoMark, AppearanceSection, PrototypeRoleSection } from '../components/Chrome.js';
import {
  Screen, Header, TitleBlock, SearchField, Section, Row, Thumb, Sci, DotLabel, TextLink, Txt,
  MenuRow, Button, KV, IconTile, IconButton, Empty,
} from '../components/Bits.js';

// Newest published plants first (the date an officer approved them).
function recentPublished(db) {
  const approvedAt = (plantId) => {
    const obs = db.observations.filter((o) => o.specimen_id === plantId && o.status === 'approved');
    const rev = db.reviews.filter((r) => obs.some((o) => o.id === r.observation_id));
    return rev.map((r) => r.created_at).sort().pop() || '';
  };
  return visiblePlants(db, 'visitor').sort((a, b) => approvedAt(b.id).localeCompare(approvedAt(a.id)));
}

export function Home({ nav }) {
  const { db } = useStore();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const recent = recentPublished(db).slice(0, 5);
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
        {recent.length === 0 ? <Empty>No plants are published yet.</Empty> : null}
        {recent.map((p, i) => (
          <Row
            key={p.id}
            left={<Thumb uri={p.photos[0]?.url} />}
            title={p.name}
            sub={
              <>
                <Sci size={14}>{p.scientific}</Sci>
                {p.endangered ? <DotLabel status="endangered" /> : null}
              </>
            }
            onPress={() => nav.go('species', { id: p.species?.id })}
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
      <PrototypeRoleSection />
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
