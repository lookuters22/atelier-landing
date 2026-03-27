import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InvoiceSetupState } from "../../lib/invoiceSetupTypes";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 32,
  },
  brand: {
    fontSize: 16,
    fontWeight: "bold",
  },
  meta: {
    fontSize: 9,
    color: "#6b7280",
    textAlign: "right",
  },
  line: {
    height: 3,
    marginBottom: 24,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
    fontSize: 10,
  },
  total: {
    marginTop: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    fontSize: 12,
    fontWeight: "bold",
  },
  footer: {
    position: "absolute",
    bottom: 32,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#9ca3af",
    textAlign: "center",
  },
});

export function InvoicePdfDocument({ setup }: { setup: InvoiceSetupState }) {
  const accent = setup.accentColor || "#3b4ed0";
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            {setup.logoDataUrl ? <Image src={setup.logoDataUrl} style={{ width: 80, height: 40, objectFit: "contain" }} /> : null}
            <Text style={[styles.brand, { marginTop: setup.logoDataUrl ? 8 : 0 }]}>{setup.legalName}</Text>
          </View>
          <View>
            <Text style={styles.meta}>Invoice INV-{setup.invoicePrefix}-0001</Text>
            <Text style={styles.meta}>Date · demo</Text>
          </View>
        </View>
        <View style={[styles.line, { backgroundColor: accent }]} />
        <Text style={{ fontSize: 12, marginBottom: 16 }}>Bill to client</Text>
        <View style={styles.row}>
          <Text>Package · Full day</Text>
          <Text>€8,500.00</Text>
        </View>
        <View style={styles.row}>
          <Text>Deposit (40%)</Text>
          <Text>€3,400.00</Text>
        </View>
        <View style={styles.total}>
          <Text>Balance due · €5,100.00</Text>
        </View>
        <Text style={{ marginTop: 24, fontSize: 9, color: "#4b5563" }}>{setup.paymentTerms}</Text>
        <Text style={styles.footer} fixed>
          {setup.footerNote}
        </Text>
      </Page>
    </Document>
  );
}
