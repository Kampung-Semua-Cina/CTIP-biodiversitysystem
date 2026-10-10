// apps/mobile/pages/Public.js
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import {
    getAboutContent,
    getHomeContent,
    getContactContent,
    getStaffPageContent,
    getAccessContent,
} from "../../shared/publicContent.js";


export function MobileHome({ park = "Niah", onNavigate }) {
    const content = getHomeContent(park);
    return (
        <View style={styles.card}>
            <Text style={styles.heading}>{content.heroTitle}</Text>
            <Text style={styles.body}>{content.heroSubtitle}</Text>

            <View style={styles.btnRow}>
                <TouchableOpacity style={styles.btnPrimary} onPress={() => onNavigate?.('dashboard')}>
                    <Text style={styles.btnPrimaryText}>Browse plants</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.btnGhost} onPress={() => onNavigate?.('map')}>
                    <Text style={styles.btnGhostText}>Open map</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            {content.features.map((item, idx) => (
                <View key={idx} style={styles.featureItem}>
                    <Text style={styles.featureTitle}>{item.title}</Text>
                    <Text style={styles.mute}>{item.text}</Text>
                </View>
            ))}

            <TouchableOpacity style={styles.btnPrimary} onPress={() => onNavigate?.('about')}>
                <Text style={styles.btnPrimaryText}>Test about</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => onNavigate?.('contact')}>
                <Text style={styles.btnPrimaryText}>Test contact</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => onNavigate?.('staff')}>
                <Text style={styles.btnPrimaryText}>Test staff</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => onNavigate?.('access')}>
                <Text style={styles.btnPrimaryText}>Test access</Text>
            </TouchableOpacity>
        </View>
    );
}

export function MobileAbout({ site = "DaunSense", park = "Niah" }) {
    const content = getAboutContent(site, park);
    return (
        <View style={styles.card}>
            <Text style={styles.heading}>{content.title}</Text>
            {content.paragraphs.map((para, i) => (
                <Text key={i} style={styles.body}>{para}</Text>
            ))}
        </View>
    );
}

export function MobileContact() {
    const content = getContactContent();
    return (
        <View style={styles.card}>
            <Text style={styles.heading}>{content.title}</Text>
            <Text style={styles.body}>Email: {content.email}</Text>
            <Text style={styles.body}>{content.organization}, {content.address}</Text>
        </View>
    );
}

export function MobileStaff({ park = "Niah", me, role = "visitor", onNavigate }) {
    const content = getStaffPageContent(park);
    return (
        <View style={styles.card}>
            <Text style={styles.heading}>{content.title}</Text>
            {me ? (
                <>
                    <Text style={styles.body}>You are signed in as {me.full_name}.</Text>
                    <TouchableOpacity style={styles.btnPrimary} onPress={() => onNavigate?.('dashboard')}>
                        <Text style={styles.btnPrimaryText}>Go to dashboard</Text>
                    </TouchableOpacity>
                </>
            ) : (
                <>
                    <Text style={styles.body}>{content.description}</Text>
                    <TouchableOpacity style={styles.btnPrimary} onPress={() => onNavigate?.('login')}>
                        <Text style={styles.btnPrimaryText}>Go to login</Text>
                    </TouchableOpacity>
                </>
            )}
            {role === 'visitor' && <Text style={[styles.mute, { marginTop: 12 }]}>{content.visitorHint}</Text>}
        </View>
    );
}

export function MobileNoAccess({ role = "visitor", onNavigate }) {
    const content = getAccessContent();
    return (
        <View style={styles.card}>
            <Text style={styles.heading}>{content.noAccessTitle}</Text>
            <Text style={styles.body}>{role === 'visitor' ? content.visitorText : content.staffText}</Text>
            <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => onNavigate?.(role === 'visitor' ? 'login' : 'dashboard')}
            >
                <Text style={styles.btnPrimaryText}>{role === 'visitor' ? 'Go to login' : 'Back to dashboard'}</Text>
            </TouchableOpacity>
        </View>
    );
}

export function MobileNotFound({ onNavigate }) {
    const content = getAccessContent();
    return (
        <View style={styles.card}>
            <Text style={styles.heading}>{content.notFoundTitle}</Text>
            <Text style={styles.body}>{content.notFoundText}</Text>
            <TouchableOpacity style={styles.btnPrimary} onPress={() => onNavigate?.('home')}>
                <Text style={styles.btnPrimaryText}>Home</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        backgroundColor: '#16301e',
        borderRadius: 16,
        padding: 18,
        marginVertical: 8,
    },
    heading: {
        fontSize: 22,
        fontWeight: '700',
        color: '#eef4e4',
        marginBottom: 10,
    },
    body: {
        fontSize: 15,
        lineHeight: 22,
        color: '#eef4e4',
        marginBottom: 10,
    },
    mute: {
        fontSize: 14,
        color: '#b9cdb0',
        lineHeight: 20,
    },
    btnRow: {
        flexDirection: 'row',
        gap: 10,
        marginVertical: 12,
    },
    btnPrimary: {
        backgroundColor: '#9bcf6a',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
        alignSelf: 'flex-start',
    },
    btnPrimaryText: {
        color: '#14301d',
        fontWeight: '700',
        fontSize: 15,
    },
    btnGhost: {
        borderWidth: 1,
        borderColor: 'rgba(190, 220, 170, 0.26)',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 10,
        alignSelf: 'flex-start',
    },
    btnGhostText: {
        color: '#eef4e4',
        fontWeight: '600',
        fontSize: 15,
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(190, 220, 170, 0.26)',
        marginVertical: 16,
    },
    featureItem: {
        marginBottom: 14,
    },
    featureTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#eef4e4',
        marginBottom: 2,
    },
});