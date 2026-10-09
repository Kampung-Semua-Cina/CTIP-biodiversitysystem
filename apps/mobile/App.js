// mobile/App.js
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, ScrollView, SafeAreaView } from 'react-native';
import { getAboutContent } from '../shared/aboutContent.js';

// Assuming you have a mobile equivalent of site.js, otherwise define them here:
const SITE = "DaunSense"; 
const PARK = "Niah";

export default function App() {
  const content = getAboutContent(SITE, PARK);

  return (
     < SafeAreaView style={styles.safeArea}>
       < ScrollView contentContainerStyle={styles.container}>
         < Text style={styles.title}>{content.title} </ Text>
        
        {content.paragraphs.map((text, index) => (
           < Text key={index} style={styles.paragraph}>
            {text}
           </ Text>
        ))}
        
         < StatusBar style="auto" />
       </ ScrollView>
     </ SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 16,
    color: '#444',
  },
});