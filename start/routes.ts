/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
const DomainsController = () => import('#controllers/domains_controller')
const VerifyController = () => import('#controllers/verify_controller')

router.on('/').render('pages/home')
router.get('/domains', [DomainsController, 'index'])
router.get('/domains/:id', [DomainsController, 'show'])
router.get('/domains/:id/tshirt.svg', [DomainsController, 'tshirtSvg'])
router.get('/verify', [VerifyController, 'show'])
