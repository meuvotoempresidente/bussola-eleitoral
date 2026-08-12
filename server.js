const express = require('express');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const app = express();

app.use(express.json());
app.use(express.static('public'));

const client = new MercadoPagoConfig({ accessToken: 'TEST-8860529513629630-081120-4068b6b645627eecf095b22bf1191216-457927592' });
const paymentApi = new Payment(client);

const dbPendentes = new Map();
const dbRespostasSalvas = new Map();

app.post('/api/criar-cobranca', async (req, res) => {
    try {
        const { answers } = req.body;
        const body = {
            transaction_amount: 1.00,
            description: 'Liberacao de Resultado - Bussola Eleitoral 2026',
            payment_method_id: 'pix',
            payer: { email: 'eleitor@bussola.com' }
        };
        const result = await paymentApi.create({ body });
        
        const qrCodeBase64 = result?.point_of_interaction?.transaction_data?.qr_code_base64 || '';
        const copiaECola = result?.point_of_interaction?.transaction_data?.qr_code || 'Erro ao gerar copia e cola';

        dbPendentes.set(String(result.id), answers);
        res.json({
            paymentId: result.id,
            qrCodeBase64: qrCodeBase64,
            copiaECola: copiaECola
        });
    } catch (error) {
        console.error("Erro detalhado do Pix:", error);
        res.status(500).json({ error: 'Erro ao gerar Pix' });
    }
});

app.get('/api/checar-status/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const paymentInfo = await paymentApi.get({ id });
        if (paymentInfo.status === 'approved') {
            let answers = dbPendentes.get(String(id));
            if (answers && !dbRespostasSalvas.has(String(id))) {
                dbRespostasSalvas.set(String(id), { timestamp: new Date(), answers });
            }
            return res.json({ status: 'approved', finalProfile: processarPerfil(answers), surveyStats: calcularEstatisticasGlobais() });
        }
        res.json({ status: paymentInfo.status });
    } catch (e) {
        res.status(500).json({ error: 'Erro ao consultar pagamento' });
    }
});

function processarPerfil(answers) {
    let counts = { A: 0, B: 0, C: 0 };
    if (answers) { answers.forEach(ans => counts[ans.choice]++); }
    let title = "", description = "", candidatos = "";
    if (counts.A >= counts.B && counts.A >= counts.C) {
        title = "Alinhamento Liberal / Reformista";
        description = "Prioridade em ajustes fiscais rigorosos, desregulamentação e livre mercado.";
        candidatos = "Flávio Bolsonaro ou Ronaldo Caiado";
    } else if (counts.B >= counts.A && counts.B >= counts.C) {
        title = "Alinhamento Social / Desenvolvimentista";
        description = "Prioridade no papel indutor do Estado, investimentos públicos e redes de proteção social.";
        candidatos = "Luiz Inácio Lula da Silva ou Samara Martins";
    } else {
        title = "Alinhamento Pragmático / Moderado / Alternativo";
        description = "Foco em governança técnica, reformas estruturais e propostas alternativas.";
        candidatos = "Romeu Zema, Renan Santos, Augusto Cury ou Rui Costa Pimenta";
    }
    return { title, description, candidatos, counts };
}

function calcularEstatisticasGlobais() {
    let totalA = 0, totalB = 0, totalC = 0;
    dbRespostasSalvas.forEach(entry => {
        entry.answers.forEach(ans => {
            if (ans.choice === 'A') totalA++;
            if (ans.choice === 'B') totalB++;
            if (ans.choice === 'C') totalC++;
        });
    });
    return {
        totalParticipants: dbRespostasSalvas.size,
        rawA: totalA,
        rawB: totalB,
        rawC: totalC
    };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
